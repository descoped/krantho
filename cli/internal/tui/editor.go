// Package tui implements the krantho terminal content editor: a bubbletea
// model built from a loaded document and its collection schema, edited
// through a vim-like modal layer (vim.go). The model and its update are
// pure — every state transition is testable without a terminal. The two
// side effects — saving (:w) and markdown rendering (:preview) — are
// injected functions, so the package never talks to the API itself.
package tui

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"charm.land/bubbles/v2/textarea"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/descoped/krantho/cli/internal/api"
)

// Pane identifies which editor pane has key focus.
type Pane int

const (
	// PaneFields is the schema-ordered frontmatter pane (top).
	PaneFields Pane = iota
	// PaneBody is the markdown body pane (bottom).
	PaneBody
)

// SaveFunc persists the edited document, asserting version — the version
// read at load, or the one the previous save returned. It returns the
// version the next save must assert. The command layer injects it as a
// closure over its session, keeping the TUI free of API calls.
type SaveFunc func(fields map[string]any, body string, version int) (newVersion int, err error)

// Field is one frontmatter field of the top pane: a schema property paired
// with the document's current value ("" when the document does not carry
// the field). edited marks a value the user changed — only edited values
// are overlaid onto the document's fields on save, so a field the document
// never carried and the user never touched stays absent.
type Field struct {
	Name     string
	Value    string
	Required bool

	edited bool
}

// Editor is the bubbletea model of `krantho content edit`: the loaded
// document split into a schema-ordered frontmatter pane and a markdown
// body pane.
type Editor struct {
	// Doc is the last-saved document. The body is edited in Body and the
	// frontmatter in Fields; Doc keeps the baseline — its meta for the
	// status bar, its field map for values the schema does not know about,
	// which :w passes through untouched.
	Doc    api.ContentDocument
	Fields []Field
	Body   textarea.Model

	// Save persists the document on :w and :wq.
	Save SaveFunc
	// Render renders markdown for :preview. Defaults to glamour
	// (preview.go); tests inject a deterministic renderer.
	Render RenderFunc
	// Version is the version the next save asserts: the version read at
	// load, advanced by each successful save. get-content.ts's engine
	// fallback synthesizes meta, but such adapters cannot getContent and
	// update-content.ts then skips its version check — sending the version
	// as read is always safe; the server arbitrates.
	Version int

	Mode Mode
	Pane Pane
	// FieldRow is the selected row of the fields pane.
	FieldRow int
	// Previewing reports whether the body pane shows the rendered preview.
	Previewing bool
	// Command buffers the command line while Mode is ModeCommand.
	Command string
	// Status is the status-bar message of the last operation.
	Status string
	// Register is the unnamed register dd cuts and yy copies into.
	Register string
	// Dirty reports unsaved changes.
	Dirty bool

	// schema is the collection schema in wire order — index-aligned with
	// Fields — consulted for a field's type and enum values.
	schema []api.SchemaField
	// fieldInput buffers the inline field edit while Mode is ModeField.
	fieldInput string
	// preview is the rendered body shown while Previewing.
	preview string
	// pendingKey is a normal-mode operator awaiting its doubling (the
	// first d of dd, the first y of yy); 0 when none is pending.
	pendingKey byte
	// undo is the snapshot stack u pops.
	undo []snapshot
}

// snapshot is one undo step: the body, cursor row, and dirty flag before a
// mutation.
type snapshot struct {
	body  string
	row   int
	dirty bool
}

// NewEditor builds the editor model for a loaded document and its
// collection schema. Fields follow the schema's order; a schema field the
// document does not carry renders empty. Focus starts on the body pane —
// the vim buffer.
func NewEditor(doc *api.ContentDocument, schema *api.CollectionSchema, save SaveFunc) Editor {
	fields := make([]Field, 0, len(schema.Fields))
	for _, sf := range schema.Fields {
		fields = append(fields, Field{
			Name:     sf.Name,
			Value:    fieldValue(doc.Fields[sf.Name]),
			Required: sf.Required,
		})
	}
	body := textarea.New()
	body.SetValue(doc.Body)
	body.Focus()
	// SetValue leaves the cursor at the end; editing starts at the top.
	moveToRow(&body, 0)
	return Editor{
		Doc:     *doc,
		Fields:  fields,
		Body:    body,
		Pane:    PaneBody,
		Save:    save,
		Render:  renderMarkdown,
		Version: doc.Meta.Version,
		schema:  schema.Fields,
	}
}

// Init starts the cursor blinking.
func (e Editor) Init() tea.Cmd {
	return textarea.Blink
}

// Update advances the model. Key messages go through the vim modal layer;
// window sizing and the remaining messages (cursor blink) are handled here.
func (e Editor) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		e.Body.SetWidth(msg.Width)
		// The fields pane, two pane titles, and the status bar take the
		// rest of the screen.
		e.Body.SetHeight(max(msg.Height-len(e.Fields)-3, 3))
		return e, nil
	case tea.KeyPressMsg:
		return updateVim(e, msg)
	}
	var cmd tea.Cmd
	e.Body, cmd = e.Body.Update(msg)
	return e, cmd
}

// View renders the two panes and the status bar in the alternate screen.
// While previewing, the body pane shows the rendered markdown instead of
// the buffer.
func (e Editor) View() tea.View {
	bodyTitle, bodyView := "Body", e.Body.View()
	if e.Previewing {
		bodyTitle, bodyView = "Preview", e.preview
	}
	content := strings.Join([]string{
		paneTitle("Fields", e.Pane == PaneFields),
		e.fieldsView(),
		paneTitle(bodyTitle, e.Pane == PaneBody),
		bodyView,
		e.statusView(),
	}, "\n")
	v := tea.NewView(content)
	v.AltScreen = true
	return v
}

// saveDocument runs the :w save: required fields checked, then the
// injected save called with the document's fields as read plus the edited
// values, the body buffer, and the version to assert. ok reports success —
// :wq quits only then.
func saveDocument(e Editor) (Editor, bool) {
	if name := requiredEmptyField(e); name != "" {
		e.Status = fmt.Sprintf("Required field %q is empty", name)
		return e, false
	}
	fields := saveFields(e)
	body := e.Body.Value()
	version, err := e.Save(fields, body, e.Version)
	if err != nil {
		e.Status = saveErrorStatus(err)
		return e, false
	}
	e.Doc.Fields = fields
	e.Doc.Body = body
	for i := range e.Fields {
		e.Fields[i].edited = false
	}
	e.Version = version
	e.Dirty = false
	e.Status = "saved"
	return e, true
}

// saveFields builds the fields map :w sends: the document's fields as
// read — values the schema does not know pass through untouched — with
// every edited pane value overlaid as its schema-typed value.
func saveFields(e Editor) map[string]any {
	fields := make(map[string]any, len(e.Doc.Fields))
	for k, v := range e.Doc.Fields {
		fields[k] = v
	}
	for i, f := range e.Fields {
		if f.edited {
			fields[f.Name] = fieldTypedValue(e.schema[i], f.Value)
		}
	}
	return fields
}

// saveErrorStatus renders a failed save for the status bar. A 409 version
// conflict names the recovery — the editor holds a stale version, so quit
// and re-open to edit the latest; other errors surface as-is.
func saveErrorStatus(err error) string {
	var apiErr *api.APIError
	if errors.As(err, &apiErr) && apiErr.Status == http.StatusConflict {
		return "Conflict: " + apiErr.Message + " — quit (:q!) and re-open to edit the latest version"
	}
	return "Save failed: " + err.Error()
}

var (
	titleFocused = lipgloss.NewStyle().Bold(true)
	titleBlurred = lipgloss.NewStyle().Faint(true)
	statusStyle  = lipgloss.NewStyle().Reverse(true)
)

// paneTitle renders a pane heading, highlighting the focused pane.
func paneTitle(name string, focused bool) string {
	if focused {
		return titleFocused.Render("▸ " + name)
	}
	return titleBlurred.Render("  " + name)
}

// fieldsView renders the schema-ordered frontmatter fields, required ones
// marked with *, the selected row marked while the pane has focus. The
// row being edited shows the input buffer with a cursor instead of its
// committed value. Each line is left unstyled so values stay contiguous.
func (e Editor) fieldsView() string {
	lines := make([]string, 0, len(e.Fields))
	for i, f := range e.Fields {
		name := f.Name
		if f.Required {
			name += "*"
		}
		value := f.Value
		if e.Mode == ModeField && i == e.FieldRow {
			value = e.fieldInput + "▌"
		}
		marker := "  "
		if e.Pane == PaneFields && i == e.FieldRow {
			marker = "▸ "
		}
		lines = append(lines, fmt.Sprintf("%s%s: %s", marker, name, value))
	}
	return strings.Join(lines, "\n")
}

// statusView renders the status bar: the mode (or the buffered command
// line), collection/slug, dirty marker, and the last status message.
func (e Editor) statusView() string {
	mode := "-- " + e.Mode.String() + " --"
	if e.Mode == ModeCommand {
		mode = ":" + e.Command
	}
	parts := []string{mode, e.Doc.Meta.Collection + "/" + e.Doc.Meta.Slug}
	if e.Dirty {
		parts = append(parts, "[+]")
	}
	if e.Status != "" {
		parts = append(parts, e.Status)
	}
	return statusStyle.Render(strings.Join(parts, "  "))
}

// fieldValue renders a frontmatter value for the fields pane; a missing or
// null field renders empty.
func fieldValue(v any) string {
	switch v := v.(type) {
	case nil:
		return ""
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

// pushUndo records the body state before a mutation.
func (e *Editor) pushUndo() {
	e.undo = append(e.undo, snapshot{body: e.Body.Value(), row: e.Body.Line(), dirty: e.Dirty})
}

// setBody replaces the body buffer and puts the cursor at the start of row.
func (e *Editor) setBody(value string, row int) {
	e.Body.SetValue(value)
	moveToRow(&e.Body, row)
}

// moveToRow moves the textarea cursor to the start of the given row.
func moveToRow(t *textarea.Model, row int) {
	for t.Line() > row {
		t.CursorUp()
	}
	for t.Line() < row && t.Line() < t.LineCount()-1 {
		t.CursorDown()
	}
	t.CursorStart()
}
