package tui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

// keyMsg builds the tea.KeyPressMsg for a named key or literal runes. A
// named special key carries only its code (empty Text — String() names
// it). A single printable rune carries both its code and text, exactly as
// a real terminal reports it — so a space arrives as code ' ' (String()
// "space"), not just the literal " ". A multi-rune convenience string is
// carried in Text alone, which the command-line reducer reads verbatim.
func keyMsg(k string) tea.KeyPressMsg {
	switch k {
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEscape}
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}
	default:
		if r := []rune(k); len(r) == 1 {
			return tea.KeyPressMsg{Code: r[0], Text: k}
		}
		return tea.KeyPressMsg{Text: k}
	}
}

// pressKey feeds one key through Update and returns the advanced editor
// plus its command.
func pressKey(t *testing.T, e Editor, k string) (Editor, tea.Cmd) {
	t.Helper()
	m, cmd := e.Update(keyMsg(k))
	return m.(Editor), cmd
}

// press feeds a key sequence through Update, dropping the commands.
func press(t *testing.T, e Editor, keys ...string) Editor {
	t.Helper()
	for _, k := range keys {
		e, _ = pressKey(t, e, k)
	}
	return e
}

// assertQuit fails unless cmd is tea.Quit.
func assertQuit(t *testing.T, cmd tea.Cmd) {
	t.Helper()
	if cmd == nil {
		t.Fatal("expected quit command, got nil")
	}
	if msg := cmd(); msg != (tea.QuitMsg{}) {
		t.Fatalf("expected tea.QuitMsg, got %#v", msg)
	}
}

// TestVimModes proves the modal layer as a pure reducer: mode transitions,
// the body-pane line operators with undo, and command-line buffering +
// dispatch — all by feeding tea.KeyMsg values and asserting state.
func TestVimModes(t *testing.T) {
	t.Run("i enters insert, keys feed the body, esc returns to normal", func(t *testing.T) {
		e := newTestEditor()
		if e.Mode != ModeNormal {
			t.Fatalf("initial mode = %v, want normal", e.Mode)
		}
		e = press(t, e, "i")
		if e.Mode != ModeInsert {
			t.Fatalf("mode after i = %v, want insert", e.Mode)
		}
		e = press(t, e, "x")
		if !strings.HasPrefix(e.Body.Value(), "x# About") {
			t.Errorf("insert did not feed the body: %q", e.Body.Value())
		}
		if !e.Dirty {
			t.Error("editing the body did not mark the editor dirty")
		}
		e = press(t, e, "esc")
		if e.Mode != ModeNormal {
			t.Fatalf("mode after esc = %v, want normal", e.Mode)
		}
	})

	t.Run("i on the fields pane opens the field editor, not insert", func(t *testing.T) {
		e := press(t, newTestEditor(), "tab", "i")
		if e.Mode != ModeField {
			t.Fatalf("mode = %v, want field", e.Mode)
		}
		if e.Body.Focused() {
			t.Error("field editing must not focus the body buffer")
		}
	})

	t.Run("colon buffers a command line, esc cancels", func(t *testing.T) {
		e := press(t, newTestEditor(), ":", "w")
		if e.Mode != ModeCommand || e.Command != "w" {
			t.Fatalf("mode = %v command = %q, want command mode with %q", e.Mode, e.Command, "w")
		}
		e = press(t, e, "q", "backspace")
		if e.Command != "w" {
			t.Errorf("command after backspace = %q, want %q", e.Command, "w")
		}
		e = press(t, e, "esc")
		if e.Mode != ModeNormal || e.Command != "" {
			t.Errorf("esc must cancel: mode = %v command = %q", e.Mode, e.Command)
		}
	})

	t.Run("unknown command surfaces a status message", func(t *testing.T) {
		e := press(t, newTestEditor(), ":", "wx", "enter")
		if !strings.Contains(e.Status, `Not an editor command: wx`) {
			t.Errorf("status = %q, want unknown-command message", e.Status)
		}
	})

	t.Run("q quits when clean", func(t *testing.T) {
		e := press(t, newTestEditor(), ":", "q")
		_, cmd := pressKey(t, e, "enter")
		assertQuit(t, cmd)
	})

	t.Run("q warns instead of quitting when dirty", func(t *testing.T) {
		e := press(t, newTestEditor(), "i", "x", "esc", ":", "q")
		e, cmd := pressKey(t, e, "enter")
		if cmd != nil {
			t.Fatal("dirty :q must not quit")
		}
		if !strings.Contains(e.Status, "No write since last change") {
			t.Errorf("status = %q, want unsaved-changes warning", e.Status)
		}
	})

	t.Run("q! always quits", func(t *testing.T) {
		e := press(t, newTestEditor(), "i", "x", "esc", ":", "q!")
		_, cmd := pressKey(t, e, "enter")
		assertQuit(t, cmd)
	})

	t.Run("dd deletes the cursor line into the register", func(t *testing.T) {
		e := press(t, newTestEditor(), "d", "d")
		if e.Register != "# About" {
			t.Errorf("register = %q, want %q", e.Register, "# About")
		}
		if got, want := e.Body.Value(), "\nFirst paragraph.\nSecond line."; got != want {
			t.Errorf("body = %q, want %q", got, want)
		}
		if !e.Dirty {
			t.Error("dd did not mark the editor dirty")
		}
	})

	t.Run("yy yanks the cursor line without changing the buffer", func(t *testing.T) {
		e := press(t, newTestEditor(), "j", "j", "y", "y")
		if e.Register != "First paragraph." {
			t.Errorf("register = %q, want %q", e.Register, "First paragraph.")
		}
		if got, want := e.Body.Value(), testDocument().Body; got != want {
			t.Errorf("yy changed the buffer: %q", got)
		}
		if e.Dirty {
			t.Error("yy marked the editor dirty")
		}
	})

	t.Run("dd then p round-trips the line", func(t *testing.T) {
		e := press(t, newTestEditor(), "d", "d", "p")
		if got, want := e.Body.Value(), "\n# About\nFirst paragraph.\nSecond line."; got != want {
			t.Errorf("body = %q, want %q", got, want)
		}
		if e.Body.Line() != 1 {
			t.Errorf("cursor row after p = %d, want the pasted line 1", e.Body.Line())
		}
	})

	t.Run("u undoes dd", func(t *testing.T) {
		e := newTestEditor()
		original := e.Body.Value()
		e = press(t, e, "d", "d", "u")
		if got := e.Body.Value(); got != original {
			t.Errorf("body after undo = %q, want %q", got, original)
		}
		if e.Dirty {
			t.Error("undo did not restore the clean state")
		}
		e = press(t, e, "u")
		if !strings.Contains(e.Status, "Already at oldest change") {
			t.Errorf("status = %q, want oldest-change message", e.Status)
		}
	})

	t.Run("line ops only apply on the body pane", func(t *testing.T) {
		e := press(t, newTestEditor(), "tab", "d", "d", "y", "y", "p")
		if e.Register != "" {
			t.Errorf("register = %q, want empty on the fields pane", e.Register)
		}
		if got, want := e.Body.Value(), testDocument().Body; got != want {
			t.Errorf("fields-pane keys changed the body: %q", got)
		}
		if e.Dirty {
			t.Error("fields-pane keys marked the editor dirty")
		}
	})
}
