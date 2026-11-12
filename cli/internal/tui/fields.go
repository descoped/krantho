package tui

import (
	"strconv"

	tea "charm.land/bubbletea/v2"

	"github.com/descoped/krantho/cli/internal/api"
)

// Field editing is type-aware, driven by the collection schema: a string
// or number field opens an inline text input (ModeField, numbers validated
// on commit), an enum field cycles through its allowed values, a boolean
// field toggles. Values stay typed — the fields map a save sends carries
// bool for booleans and float64 for numbers, never their string renderings.

// updateFieldKeys handles one normal-mode key on the fields pane: j/k row
// selection, Enter/Space/i to edit the selected field per its type, and
// h/l to cycle an enum backwards/forwards.
func updateFieldKeys(e Editor, k string) (Editor, tea.Cmd) {
	switch k {
	case "j", "down":
		e.FieldRow = min(e.FieldRow+1, len(e.Fields)-1)
	case "k", "up":
		e.FieldRow = max(e.FieldRow-1, 0)
	case "enter", "space", "i":
		e = editField(e)
	case "h", "left":
		e = cycleEnum(e, -1)
	case "l", "right":
		e = cycleEnum(e, 1)
	}
	return e, nil
}

// editField starts the per-type edit of the selected field: an enum
// cycles to its next value, a boolean toggles, a string or number opens
// the inline input seeded with the current value.
func editField(e Editor) Editor {
	if len(e.Fields) == 0 {
		return e
	}
	sf := e.schema[e.FieldRow]
	switch {
	case len(sf.Enum) > 0:
		return cycleEnum(e, 1)
	case sf.Type == "boolean":
		return setFieldValue(e, strconv.FormatBool(e.Fields[e.FieldRow].Value != "true"))
	default:
		e.Mode = ModeField
		e.fieldInput = e.Fields[e.FieldRow].Value
		return e
	}
}

// cycleEnum steps the selected enum field through the schema's allowed
// values in dir (+1 forwards, -1 backwards), wrapping around. A value
// outside the enum — including the empty value of a field the document
// does not carry — starts the cycle at its first value.
func cycleEnum(e Editor, dir int) Editor {
	if len(e.Fields) == 0 {
		return e
	}
	values := e.schema[e.FieldRow].Enum
	if len(values) == 0 {
		return e
	}
	next := 0
	for i, v := range values {
		if v == e.Fields[e.FieldRow].Value {
			next = (i + dir + len(values)) % len(values)
			break
		}
	}
	return setFieldValue(e, values[next])
}

// updateFieldEdit is the ModeField reducer: runes feed the inline input,
// Enter commits (numbers validated), Esc cancels back to the committed
// value.
func updateFieldEdit(e Editor, key tea.KeyPressMsg) (Editor, tea.Cmd) {
	switch key.String() {
	case "esc":
		e.Mode = ModeNormal
		e.fieldInput = ""
	case "enter":
		return commitFieldEdit(e), nil
	case "backspace":
		if e.fieldInput != "" {
			runes := []rune(e.fieldInput)
			e.fieldInput = string(runes[:len(runes)-1])
		}
	default:
		// Printable input carries its characters in Text — a rune, or a
		// space (Text " "). Special keys leave Text empty, so they add
		// nothing to the inline input.
		e.fieldInput += key.Text
	}
	return e, nil
}

// commitFieldEdit commits the inline input into the selected field. A
// number field rejects input that does not parse, staying in ModeField so
// the value can be corrected (or abandoned with Esc).
func commitFieldEdit(e Editor) Editor {
	if e.schema[e.FieldRow].Type == "number" {
		if _, err := strconv.ParseFloat(e.fieldInput, 64); err != nil {
			e.Status = "Not a number: " + e.fieldInput
			return e
		}
	}
	e = setFieldValue(e, e.fieldInput)
	e.Mode = ModeNormal
	e.fieldInput = ""
	return e
}

// setFieldValue sets the selected field's value, marking the field edited
// and the editor dirty when the value actually changed.
func setFieldValue(e Editor, value string) Editor {
	if e.Fields[e.FieldRow].Value == value {
		return e
	}
	e.Fields[e.FieldRow].Value = value
	e.Fields[e.FieldRow].edited = true
	e.Dirty = true
	return e
}

// fieldTypedValue converts a pane value to the schema's type for the save
// payload: number → float64 (validated at commit), boolean → bool,
// everything else stays a string.
func fieldTypedValue(sf api.SchemaField, value string) any {
	switch sf.Type {
	case "number":
		// Only commitFieldEdit writes number values into the edited map, and
		// it rejects anything ParseFloat cannot parse — the error is
		// structurally impossible here, not ignored.
		f, _ := strconv.ParseFloat(value, 64)
		return f
	case "boolean":
		return value == "true"
	default:
		return value
	}
}

// requiredEmptyField returns the name of the first required field whose
// value is empty — the pre-save validation :w refuses to send — or ""
// when every required field has a value.
func requiredEmptyField(e Editor) string {
	for _, f := range e.Fields {
		if f.Required && f.Value == "" {
			return f.Name
		}
	}
	return ""
}
