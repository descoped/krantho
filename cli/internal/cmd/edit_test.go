package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/descoped/krantho/cli/internal/tui"
)

// TestContentEdit proves content edit loads the document and its schema
// through the session, hands the constructed editor to the program runner
// seam, and wires it a save function that PUTs through the session with
// the asserted _version.
func TestContentEdit(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/content/pages/about", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"meta": map[string]any{
				"collection": "pages", "slug": "about", "locale": "en",
				"version": 3, "status": "draft", "source": "api",
				"changedBy": nil, "createdAt": "2026-07-01T10:00:00.000Z",
			},
			"fields":   map[string]any{"title": "About Us"},
			"body":     "# About\n",
			"html":     "<h1>About</h1>\n",
			"sections": map[string]any{},
		})
	})
	var putBody map[string]any
	mux.HandleFunc("PUT /api/content/pages/about", func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&putBody); err != nil {
			t.Errorf("PUT body did not decode: %v", err)
		}
		// update-content.ts's 200 body — { slug, collection, message },
		// no version.
		writeJSON(w, http.StatusOK, map[string]any{
			"slug": "about", "collection": "pages", "message": "Updated",
		})
	})
	mux.HandleFunc("GET /api/schema/pages", func(w http.ResponseWriter, _ *http.Request) {
		// Raw JSON keeps the property order get-schema.ts emits: code
		// fields in declaration order.
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"pages","source":"code","schema":{"type":"object",` +
			`"properties":{"title":{"type":"string"},"description":{"type":"string"}},` +
			`"required":["title"]}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	var captured tea.Model
	restore := runProgram
	runProgram = func(model tea.Model) error {
		captured = model
		return nil
	}
	defer func() { runProgram = restore }()

	credsPath := filepath.Join(t.TempDir(), "credentials.json")
	runCLI(t, credsPath, "content", "edit", "pages", "about", "--api-url", srv.URL)

	editor, ok := captured.(tui.Editor)
	if !ok {
		t.Fatalf("runProgram received %T, want tui.Editor", captured)
	}
	if editor.Doc.Meta.Collection != "pages" || editor.Doc.Meta.Slug != "about" {
		t.Errorf("editor document = %s/%s, want pages/about",
			editor.Doc.Meta.Collection, editor.Doc.Meta.Slug)
	}
	want := []tui.Field{
		{Name: "title", Value: "About Us", Required: true},
		{Name: "description", Value: ""},
	}
	if len(editor.Fields) != len(want) {
		t.Fatalf("editor fields = %v, want %v", editor.Fields, want)
	}
	for i, f := range want {
		if editor.Fields[i] != f {
			t.Errorf("field %d = %+v, want %+v", i, editor.Fields[i], f)
		}
	}
	if got := editor.Body.Value(); got != "# About\n" {
		t.Errorf("editor body = %q, want %q", got, "# About\n")
	}
	if editor.Version != 3 {
		t.Errorf("editor version = %d, want the loaded 3", editor.Version)
	}

	// The injected save PUTs through the session with the asserted
	// _version and returns the version the next save must assert.
	newVersion, err := editor.Save(
		map[string]any{"title": "About Us!"}, "# About!\n", editor.Version)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if newVersion != 4 {
		t.Errorf("save returned version %d, want 4", newVersion)
	}
	if putBody["_version"] != float64(3) {
		t.Errorf("PUT _version = %v, want 3", putBody["_version"])
	}
	if putBody["body"] != "# About!\n" {
		t.Errorf("PUT body = %v, want %q", putBody["body"], "# About!\n")
	}
	fields, ok := putBody["fields"].(map[string]any)
	if !ok || fields["title"] != "About Us!" {
		t.Errorf("PUT fields = %v, want title %q", putBody["fields"], "About Us!")
	}
}
