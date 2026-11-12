package tui

import (
	"errors"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/descoped/krantho/cli/internal/api"
)

// testDocument is a loaded pages/about document carrying values for some
// of the schema's fields plus one field the schema does not know.
func testDocument() *api.ContentDocument {
	return &api.ContentDocument{
		Meta: api.DocumentMeta{
			Collection: "pages", Slug: "about", Locale: "en",
			Version: 3, Status: "draft",
		},
		Fields: map[string]any{
			"title":       "About Us",
			"description": "Who we are",
			"order":       float64(2),
			"legacy":      "schema does not know this",
		},
		Body: "# About\n\nFirst paragraph.\nSecond line.",
	}
}

// testSchema mirrors a decoded GET /api/schema/:collection response:
// wire-ordered fields with requiredness resolved.
func testSchema() *api.CollectionSchema {
	return &api.CollectionSchema{
		Name:   "pages",
		Source: "code",
		Fields: []api.SchemaField{
			{Name: "title", Type: "string", Required: true},
			{Name: "description", Type: "string"},
			{Name: "order", Type: "number"},
			{Name: "meta-description", Type: "string"},
		},
	}
}

// newTestEditor builds the editor over the shared document + schema pair.
// Tests that dispatch :w build their own editor with a recording save.
func newTestEditor() Editor {
	return NewEditor(testDocument(), testSchema(), nil)
}

// saveCall is one invocation a recording save function captured.
type saveCall struct {
	fields  map[string]any
	body    string
	version int
}

// recordingSave returns a SaveFunc appending every call to calls. It fails
// with err when set; otherwise it returns version+1, mirroring the command
// layer's append-only version bump.
func recordingSave(calls *[]saveCall, err error) SaveFunc {
	return func(fields map[string]any, body string, version int) (int, error) {
		*calls = append(*calls, saveCall{fields: fields, body: body, version: version})
		if err != nil {
			return 0, err
		}
		return version + 1, nil
	}
}

// TestEditorLoad proves the editor loads content + schema into the
// two-pane model: fields render schema-ordered with required markers and
// document values, the body pane holds the markdown body, and Tab moves
// pane focus.
func TestEditorLoad(t *testing.T) {
	t.Run("fields are schema-ordered with doc values", func(t *testing.T) {
		e := newTestEditor()
		want := []Field{
			{Name: "title", Value: "About Us", Required: true},
			{Name: "description", Value: "Who we are"},
			{Name: "order", Value: "2"},
			{Name: "meta-description", Value: ""},
		}
		if len(e.Fields) != len(want) {
			t.Fatalf("fields = %v, want %v", e.Fields, want)
		}
		for i, f := range want {
			if e.Fields[i] != f {
				t.Errorf("field %d = %+v, want %+v", i, e.Fields[i], f)
			}
		}
	})

	t.Run("body pane holds the document body", func(t *testing.T) {
		e := newTestEditor()
		if got, want := e.Body.Value(), testDocument().Body; got != want {
			t.Errorf("body = %q, want %q", got, want)
		}
		if e.Body.Line() != 0 {
			t.Errorf("cursor row = %d, want 0", e.Body.Line())
		}
	})

	t.Run("original document is retained", func(t *testing.T) {
		e := newTestEditor()
		if e.Doc.Meta.Version != 3 {
			t.Errorf("doc version = %d, want 3", e.Doc.Meta.Version)
		}
		if e.Doc.Fields["legacy"] != "schema does not know this" {
			t.Errorf("doc fields lost the schema-unknown value: %v", e.Doc.Fields)
		}
	})

	t.Run("view renders ordered fields with required markers", func(t *testing.T) {
		view := newTestEditor().View().Content
		title := strings.Index(view, "title*: About Us")
		desc := strings.Index(view, "description: Who we are")
		meta := strings.Index(view, "meta-description: ")
		if title == -1 || desc == -1 || meta == -1 {
			t.Fatalf("view missing field lines:\n%s", view)
		}
		if !(title < desc && desc < meta) {
			t.Errorf("fields not schema-ordered: title@%d description@%d meta-description@%d",
				title, desc, meta)
		}
		if strings.Contains(view, "description*") {
			t.Errorf("optional field marked required:\n%s", view)
		}
		for _, want := range []string{"First paragraph.", "NORMAL", "pages/about"} {
			if !strings.Contains(view, want) {
				t.Errorf("view missing %q:\n%s", want, view)
			}
		}
	})

	t.Run("tab switches pane focus", func(t *testing.T) {
		e := newTestEditor()
		if e.Pane != PaneBody {
			t.Fatalf("initial pane = %v, want body", e.Pane)
		}
		m, _ := e.Update(tea.KeyPressMsg{Code: tea.KeyTab})
		e = m.(Editor)
		if e.Pane != PaneFields {
			t.Fatalf("pane after tab = %v, want fields", e.Pane)
		}
		if e.Body.Focused() {
			t.Error("body still focused after switching to the fields pane")
		}
		m, _ = e.Update(tea.KeyPressMsg{Code: tea.KeyTab})
		e = m.(Editor)
		if e.Pane != PaneBody {
			t.Fatalf("pane after second tab = %v, want body", e.Pane)
		}
		if !e.Body.Focused() {
			t.Error("body not focused after switching back")
		}
	})
}

// TestEditorSave proves the :w save path: the injected save function
// receives the edited fields (schema-unknown values preserved), the body
// buffer, and the version to assert; success clears the dirty state and
// advances the version; a 409 conflict surfaces in the status bar and
// keeps :wq from quitting; :wq quits only after a successful save.
func TestEditorSave(t *testing.T) {
	t.Run("w sends edited fields, body, and the loaded version", func(t *testing.T) {
		var calls []saveCall
		e := NewEditor(testDocument(), testSchema(), recordingSave(&calls, nil))
		// Edit the body, then the description field through the fields pane.
		e = press(t, e, "i", "x", "esc")
		e = press(t, e, "tab", "j", "enter", "!", "enter")
		e = press(t, e, ":", "w", "enter")
		if len(calls) != 1 {
			t.Fatalf("save calls = %d, want 1", len(calls))
		}
		call := calls[0]
		if call.version != 3 {
			t.Errorf("asserted version = %d, want the loaded 3", call.version)
		}
		if want := "x" + testDocument().Body; call.body != want {
			t.Errorf("body = %q, want %q", call.body, want)
		}
		if call.fields["description"] != "Who we are!" {
			t.Errorf("edited field = %v, want %q", call.fields["description"], "Who we are!")
		}
		for name, want := range map[string]any{
			"title":  "About Us",
			"order":  float64(2),
			"legacy": "schema does not know this",
		} {
			if call.fields[name] != want {
				t.Errorf("field %q = %v, want the as-read %v", name, call.fields[name], want)
			}
		}
		if e.Dirty {
			t.Error("successful save left the editor dirty")
		}
		if e.Status != "saved" {
			t.Errorf("status = %q, want %q", e.Status, "saved")
		}
		if e.Version != 4 {
			t.Errorf("version after save = %d, want the returned 4", e.Version)
		}

		// The next save asserts the version the last one returned.
		e = press(t, e, "tab", "i", "y", "esc", ":", "w", "enter")
		if len(calls) != 2 {
			t.Fatalf("save calls = %d, want 2", len(calls))
		}
		if calls[1].version != 4 {
			t.Errorf("second save asserted %d, want 4", calls[1].version)
		}
	})

	t.Run("409 shows the conflict and wq does not quit", func(t *testing.T) {
		conflict := &api.APIError{Status: 409, Message: "Content has been modified by another user"}
		var calls []saveCall
		e := NewEditor(testDocument(), testSchema(), recordingSave(&calls, conflict))
		e = press(t, e, "i", "x", "esc", ":", "wq")
		e, cmd := pressKey(t, e, "enter")
		if cmd != nil {
			t.Fatal("wq must not quit when the save conflicts")
		}
		if len(calls) != 1 {
			t.Fatalf("save calls = %d, want 1", len(calls))
		}
		for _, want := range []string{"Content has been modified by another user", "re-open"} {
			if !strings.Contains(e.Status, want) {
				t.Errorf("status = %q, want it to contain %q", e.Status, want)
			}
		}
		if !e.Dirty {
			t.Error("failed save cleared the dirty state")
		}
		if e.Version != 3 {
			t.Errorf("failed save moved the version to %d, want 3", e.Version)
		}
	})

	t.Run("other save errors surface in the status bar", func(t *testing.T) {
		var calls []saveCall
		e := NewEditor(testDocument(), testSchema(), recordingSave(&calls, errors.New("connection refused")))
		e = press(t, e, "i", "x", "esc", ":", "w", "enter")
		if !strings.Contains(e.Status, "Save failed: connection refused") {
			t.Errorf("status = %q, want the save error", e.Status)
		}
		if !e.Dirty {
			t.Error("failed save cleared the dirty state")
		}
	})

	t.Run("wq saves then quits on success", func(t *testing.T) {
		var calls []saveCall
		e := NewEditor(testDocument(), testSchema(), recordingSave(&calls, nil))
		e = press(t, e, "i", "x", "esc", ":", "wq")
		e, cmd := pressKey(t, e, "enter")
		assertQuit(t, cmd)
		if len(calls) != 1 {
			t.Fatalf("save calls = %d, want 1", len(calls))
		}
		if e.Dirty {
			t.Error("wq quit with the editor still dirty")
		}
	})
}
