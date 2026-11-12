package tui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

// Mode is the vim modal state.
type Mode int

const (
	// ModeNormal interprets keys as operators and motions.
	ModeNormal Mode = iota
	// ModeInsert routes keys into the body buffer.
	ModeInsert
	// ModeCommand buffers a ':' command line until Enter dispatches it.
	ModeCommand
	// ModeField buffers an inline field edit until Enter commits it.
	ModeField
)

// String returns the status-bar name of the mode.
func (m Mode) String() string {
	switch m {
	case ModeInsert:
		return "INSERT"
	case ModeCommand:
		return "COMMAND"
	case ModeField:
		return "FIELD"
	default:
		return "NORMAL"
	}
}

// updateVim is the modal layer: a pure reducer advancing the editor by one
// key. Normal mode interprets operators, insert mode feeds the body
// buffer, command mode buffers a ':' command line until Enter dispatches,
// field mode buffers an inline field edit until Enter commits.
func updateVim(e Editor, key tea.KeyPressMsg) (Editor, tea.Cmd) {
	e.Status = ""
	switch e.Mode {
	case ModeInsert:
		return updateInsert(e, key)
	case ModeCommand:
		return updateCommand(e, key)
	case ModeField:
		return updateFieldEdit(e, key)
	default:
		return updateNormal(e, key)
	}
}

// updateNormal handles one normal-mode key: pane switching, mode entry,
// field editing on the fields pane, and — on the body pane — the line
// operators and motions.
func updateNormal(e Editor, key tea.KeyPressMsg) (Editor, tea.Cmd) {
	k := key.String()
	// While previewing, the buffer is out of sight — only closing the
	// preview (Esc) and the command line (:preview toggles back, :q, :w)
	// respond, so nothing edits the buffer blind.
	if e.Previewing {
		switch k {
		case "esc":
			e.Previewing = false
			e.preview = ""
		case ":":
			e.Mode = ModeCommand
			e.Command = ""
		}
		return e, nil
	}
	// A pending d/y operator consumes the next key: doubled it becomes a
	// line op, anything else cancels it.
	if e.pendingKey != 0 {
		pending := e.pendingKey
		e.pendingKey = 0
		if e.Pane == PaneBody && k == string(pending) {
			if pending == 'd' {
				return deleteLine(e), nil
			}
			return yankLine(e), nil
		}
		return e, nil
	}
	switch k {
	case "tab":
		return switchPane(e)
	case ":":
		e.Mode = ModeCommand
		e.Command = ""
		return e, nil
	}
	if e.Pane == PaneFields {
		return updateFieldKeys(e, k)
	}
	switch k {
	case "i":
		cmd := e.Body.Focus()
		e.Mode = ModeInsert
		e.pushUndo()
		return e, cmd
	case "d", "y":
		e.pendingKey = k[0]
	case "p":
		e = pasteAfter(e)
	case "u":
		e = undoChange(e)
	case "h", "left":
		e = moveBody(e, tea.KeyLeft)
	case "l", "right":
		e = moveBody(e, tea.KeyRight)
	case "j", "down":
		e = moveBody(e, tea.KeyDown)
	case "k", "up":
		e = moveBody(e, tea.KeyUp)
	}
	return e, nil
}

// updateInsert routes keys into the body buffer until Esc returns to
// normal mode.
func updateInsert(e Editor, key tea.KeyPressMsg) (Editor, tea.Cmd) {
	if key.String() == "esc" {
		e.Mode = ModeNormal
		// An insert session that changed nothing is not an undo step.
		if n := len(e.undo); n > 0 && e.undo[n-1].body == e.Body.Value() {
			e.undo = e.undo[:n-1]
		}
		return e, nil
	}
	before := e.Body.Value()
	var cmd tea.Cmd
	e.Body, cmd = e.Body.Update(key)
	if e.Body.Value() != before {
		e.Dirty = true
	}
	return e, cmd
}

// updateCommand buffers the command line: Enter dispatches, Esc cancels,
// Backspace edits (cancelling when the line is already empty).
func updateCommand(e Editor, key tea.KeyPressMsg) (Editor, tea.Cmd) {
	switch key.String() {
	case "esc":
		e.Mode = ModeNormal
		e.Command = ""
	case "enter":
		return dispatchCommand(e)
	case "backspace":
		if e.Command == "" {
			e.Mode = ModeNormal
			return e, nil
		}
		runes := []rune(e.Command)
		e.Command = string(runes[:len(runes)-1])
	default:
		// Printable input carries its characters in Text — a rune, or a
		// space (Text " "). Special keys leave Text empty, so they add
		// nothing to the command line.
		e.Command += key.Text
	}
	return e, nil
}

// dispatchCommand runs the buffered command line and returns to normal
// mode. w saves through the injected save function; wq saves first and
// quits only on success; q quits unless there are unsaved changes, q!
// always quits; preview toggles the rendered body pane.
func dispatchCommand(e Editor) (Editor, tea.Cmd) {
	command := strings.TrimSpace(e.Command)
	e.Mode = ModeNormal
	e.Command = ""
	switch command {
	case "":
		return e, nil
	case "w":
		e, _ = saveDocument(e)
		return e, nil
	case "wq":
		e, ok := saveDocument(e)
		if !ok {
			return e, nil
		}
		return e, tea.Quit
	case "q":
		if e.Dirty {
			e.Status = "No write since last change (add ! to override)"
			return e, nil
		}
		return e, tea.Quit
	case "q!":
		return e, tea.Quit
	case "preview":
		return togglePreview(e), nil
	}
	e.Status = "Not an editor command: " + command
	return e, nil
}

// switchPane toggles key focus between the fields and body panes.
func switchPane(e Editor) (Editor, tea.Cmd) {
	if e.Pane == PaneBody {
		e.Pane = PaneFields
		e.Body.Blur()
		return e, nil
	}
	e.Pane = PaneBody
	return e, e.Body.Focus()
}

// deleteLine cuts the cursor line into the unnamed register (dd).
func deleteLine(e Editor) Editor {
	e.pushUndo()
	lines := strings.Split(e.Body.Value(), "\n")
	row := e.Body.Line()
	e.Register = lines[row]
	lines = append(lines[:row], lines[row+1:]...)
	if len(lines) == 0 {
		lines = []string{""}
	}
	e.setBody(strings.Join(lines, "\n"), min(row, len(lines)-1))
	e.Dirty = true
	return e
}

// yankLine copies the cursor line into the unnamed register (yy).
func yankLine(e Editor) Editor {
	lines := strings.Split(e.Body.Value(), "\n")
	e.Register = lines[e.Body.Line()]
	return e
}

// pasteAfter inserts the register as a new line below the cursor (p) and
// moves the cursor onto it.
func pasteAfter(e Editor) Editor {
	if e.Register == "" {
		e.Status = "Nothing in register"
		return e
	}
	e.pushUndo()
	lines := strings.Split(e.Body.Value(), "\n")
	row := e.Body.Line()
	lines = append(lines[:row+1], append([]string{e.Register}, lines[row+1:]...)...)
	e.setBody(strings.Join(lines, "\n"), row+1)
	e.Dirty = true
	return e
}

// undoChange pops the snapshot stack (u), restoring the body, cursor row,
// and dirty flag recorded before the undone mutation.
func undoChange(e Editor) Editor {
	n := len(e.undo)
	if n == 0 {
		e.Status = "Already at oldest change"
		return e
	}
	snap := e.undo[n-1]
	e.undo = e.undo[:n-1]
	e.setBody(snap.body, snap.row)
	e.Dirty = snap.dirty
	return e
}

// moveBody forwards a cursor-movement key to the body buffer. The key is a
// v2 key code (tea.KeyLeft/Right/Up/Down) sent as a press message.
func moveBody(e Editor, key rune) Editor {
	e.Body, _ = e.Body.Update(tea.KeyPressMsg{Code: key})
	return e
}
