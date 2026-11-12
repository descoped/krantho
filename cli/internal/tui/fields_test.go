package tui

import (
	"strings"
	"testing"

	"github.com/descoped/krantho/cli/internal/api"
)

// typedDocument is a loaded services/consulting document with one value
// of each editable field type.
func typedDocument() *api.ContentDocument {
	return &api.ContentDocument{
		Meta: api.DocumentMeta{
			Collection: "services", Slug: "consulting", Locale: "en",
			Version: 5, Status: "draft",
		},
		Fields: map[string]any{
			"title":    "Consulting",
			"status":   "draft",
			"featured": true,
			"order":    float64(2),
		},
		Body: "# Consulting\n",
	}
}

// typedSchema pairs typedDocument with a string, an enum, a boolean, and
// a number field.
func typedSchema() *api.CollectionSchema {
	return &api.CollectionSchema{
		Name:   "services",
		Source: "code",
		Fields: []api.SchemaField{
			{Name: "title", Type: "string", Required: true},
			{Name: "status", Type: "string", Enum: []string{"draft", "published", "archived"}},
			{Name: "featured", Type: "boolean"},
			{Name: "order", Type: "number"},
		},
	}
}

// fieldByName returns the pane field with the given name.
func fieldByName(t *testing.T, e Editor, name string) Field {
	t.Helper()
	for _, f := range e.Fields {
		if f.Name == name {
			return f
		}
	}
	t.Fatalf("no field %q in %v", name, e.Fields)
	return Field{}
}

// TestFieldEditing proves type-aware field editing on the fields pane:
// enum values cycle, booleans toggle, numbers reject non-numeric input,
// values stay typed in the save payload, and an empty required field
// blocks the save before any PUT.
func TestFieldEditing(t *testing.T) {
	newTyped := func(save SaveFunc) Editor {
		return NewEditor(typedDocument(), typedSchema(), save)
	}

	t.Run("enum cycles through the schema values", func(t *testing.T) {
		e := press(t, newTyped(nil), "tab", "j")
		steps := []struct{ key, want string }{
			{"enter", "published"}, // draft → published
			{" ", "archived"},      // space cycles too
			{"l", "draft"},         // wraps around
			{"h", "archived"},      // backwards
		}
		for _, step := range steps {
			e = press(t, e, step.key)
			if got := fieldByName(t, e, "status").Value; got != step.want {
				t.Errorf("status after %q = %q, want %q", step.key, got, step.want)
			}
		}
		if !e.Dirty {
			t.Error("cycling the enum did not mark the editor dirty")
		}
	})

	t.Run("boolean toggles", func(t *testing.T) {
		e := press(t, newTyped(nil), "tab", "j", "j", "enter")
		if got := fieldByName(t, e, "featured").Value; got != "false" {
			t.Fatalf("featured after toggle = %q, want %q", got, "false")
		}
		e = press(t, e, "enter")
		if got := fieldByName(t, e, "featured").Value; got != "true" {
			t.Fatalf("featured after second toggle = %q, want %q", got, "true")
		}
	})

	t.Run("number input rejects non-numeric on commit", func(t *testing.T) {
		e := press(t, newTyped(nil), "tab", "j", "j", "j", "i", "backspace", "abc")
		e = press(t, e, "enter")
		if e.Mode != ModeField {
			t.Fatalf("rejected commit left mode %v, want field", e.Mode)
		}
		if !strings.Contains(e.Status, "Not a number: abc") {
			t.Errorf("status = %q, want the not-a-number rejection", e.Status)
		}
		e = press(t, e, "backspace", "backspace", "backspace", "42", "enter")
		if e.Mode != ModeNormal {
			t.Fatalf("valid commit left mode %v, want normal", e.Mode)
		}
		if got := fieldByName(t, e, "order").Value; got != "42" {
			t.Errorf("order = %q, want %q", got, "42")
		}
	})

	t.Run("save sends typed values", func(t *testing.T) {
		var calls []saveCall
		e := press(t, newTyped(recordingSave(&calls, nil)),
			"tab",
			"j", "enter", // status: draft → published
			"j", "enter", // featured: true → false
			"j", "i", "backspace", "42", "enter", // order: 2 → 42
			":", "w", "enter",
		)
		if len(calls) != 1 {
			t.Fatalf("save calls = %d, want 1", len(calls))
		}
		for name, want := range map[string]any{
			"status":   "published",
			"featured": false,
			"order":    float64(42),
			"title":    "Consulting",
		} {
			if got := calls[0].fields[name]; got != want {
				t.Errorf("field %q = %v (%T), want %v (%T)", name, got, got, want, want)
			}
		}
		if e.Dirty {
			t.Error("successful save left the editor dirty")
		}
	})

	t.Run("empty required field blocks the save", func(t *testing.T) {
		var calls []saveCall
		e := press(t, newTyped(recordingSave(&calls, nil)), "tab", "i")
		for range len("Consulting") {
			e = press(t, e, "backspace")
		}
		e = press(t, e, "enter", ":", "w", "enter")
		if len(calls) != 0 {
			t.Fatalf("save calls = %d, want none — validation must run before the PUT", len(calls))
		}
		if !strings.Contains(e.Status, `Required field "title" is empty`) {
			t.Errorf("status = %q, want the required-field error", e.Status)
		}
		e = press(t, e, ":", "wq")
		e, cmd := pressKey(t, e, "enter")
		if cmd != nil {
			t.Fatal("wq must not quit while a required field is empty")
		}
		if len(calls) != 0 {
			t.Fatalf("wq issued %d save calls, want none", len(calls))
		}
	})
}
