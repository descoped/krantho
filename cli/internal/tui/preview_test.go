package tui

import (
	"errors"
	"strings"
	"testing"
)

// TestPreviewToggle proves :preview swaps the body pane for the injected
// renderer's output and back — Esc also returns — while the body buffer
// itself stays untouched.
func TestPreviewToggle(t *testing.T) {
	t.Run("the default renderer is wired", func(t *testing.T) {
		if newTestEditor().Render == nil {
			t.Fatal("NewEditor left Render nil — glamour must be the default")
		}
	})

	t.Run("preview renders the buffer and toggles back", func(t *testing.T) {
		e := newTestEditor()
		var rendered []string
		e.Render = func(markdown string) (string, error) {
			rendered = append(rendered, markdown)
			return "«rendered preview»", nil
		}
		before := e.Body.Value()

		e = press(t, e, ":", "preview", "enter")
		if !e.Previewing {
			t.Fatal("editor not previewing after :preview")
		}
		if len(rendered) != 1 || rendered[0] != before {
			t.Fatalf("renderer received %q, want the body %q", rendered, before)
		}
		view := e.View().Content
		if !strings.Contains(view, "«rendered preview»") {
			t.Errorf("view does not show the rendered preview:\n%s", view)
		}
		if strings.Contains(view, "First paragraph.") {
			t.Errorf("view still shows the raw buffer:\n%s", view)
		}
		if got := e.Body.Value(); got != before {
			t.Fatalf("preview changed the buffer: %q, want %q", got, before)
		}
		if e.Dirty {
			t.Error("preview marked the editor dirty")
		}

		e = press(t, e, ":", "preview", "enter")
		if e.Previewing {
			t.Fatal("second :preview did not toggle the preview off")
		}
		if !strings.Contains(e.View().Content, "First paragraph.") {
			t.Error("buffer not shown again after toggling back")
		}
		if got := e.Body.Value(); got != before {
			t.Fatalf("toggling changed the buffer: %q, want %q", got, before)
		}
	})

	t.Run("esc closes the preview and editing keys are inert meanwhile", func(t *testing.T) {
		e := newTestEditor()
		e.Render = func(string) (string, error) { return "rendered", nil }
		before := e.Body.Value()
		e = press(t, e, ":", "preview", "enter", "i", "x")
		if e.Mode != ModeNormal {
			t.Fatalf("mode while previewing = %v, want normal", e.Mode)
		}
		if got := e.Body.Value(); got != before {
			t.Fatalf("keys edited the buffer behind the preview: %q", got)
		}
		e = press(t, e, "esc")
		if e.Previewing {
			t.Fatal("esc did not close the preview")
		}
	})

	t.Run("a renderer failure surfaces in the status bar", func(t *testing.T) {
		e := newTestEditor()
		e.Render = func(string) (string, error) { return "", errors.New("bad terminal") }
		e = press(t, e, ":", "preview", "enter")
		if e.Previewing {
			t.Fatal("failed render still entered preview")
		}
		if !strings.Contains(e.Status, "Preview failed: bad terminal") {
			t.Errorf("status = %q, want the render error", e.Status)
		}
	})
}
