package tui

import (
	"os"

	"charm.land/glamour/v2"
	"charm.land/lipgloss/v2"
)

// RenderFunc renders markdown for the :preview pane. Injectable so tests
// substitute a deterministic renderer; NewEditor defaults it to glamour.
type RenderFunc func(markdown string) (string, error)

// renderMarkdown is the default RenderFunc: glamour with the style
// matching the terminal background. glamour v2 dropped auto-detection, so
// the background is probed here and the matching built-in style selected.
func renderMarkdown(markdown string) (string, error) {
	style := "dark"
	if !lipgloss.HasDarkBackground(os.Stdin, os.Stdout) {
		style = "light"
	}
	renderer, err := glamour.NewTermRenderer(glamour.WithStylePath(style))
	if err != nil {
		return "", err
	}
	return renderer.Render(markdown)
}

// togglePreview flips the body pane between the editable buffer and its
// rendered markdown (:preview). Rendering reads the buffer and never
// writes it — toggling cannot change the document.
func togglePreview(e Editor) Editor {
	if e.Previewing {
		e.Previewing = false
		e.preview = ""
		return e
	}
	rendered, err := e.Render(e.Body.Value())
	if err != nil {
		e.Status = "Preview failed: " + err.Error()
		return e
	}
	e.preview = rendered
	e.Previewing = true
	return e
}
