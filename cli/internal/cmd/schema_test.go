package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// fakeSchemaServer serves GET /api/collections (list-collections.ts),
// GET /api/schema/:collection (get-schema.ts): { name, source, schema }
// where schema is the zod-generated JSON Schema of the code-defined fields
// with runtime fields merged in — each runtime property carries the
// handler's `_runtime: true` marker, and required runtime fields are
// appended to the schema-level required array — plus the runtime-field
// write endpoints of save-runtime-field.ts and delete-runtime-field.ts. An
// unknown collection is the validator's 404 (validators.ts
// validateCollectionParam).
type fakeSchemaServer struct {
	collectionsCalls int
	schemaCalls      map[string]int
	exportCalls      map[string]int
	saveFieldCalls   int
	lastSaveBody     map[string]any
	deleteFieldCalls int
	lastDeletedField string
}

// pagesCodeFields are the code-defined Zod field names of the pages fixture
// — the write handlers refuse them with their 409s.
var pagesCodeFields = map[string]bool{"title": true, "description": true, "status": true}

// pagesRuntimeFields are the runtime extensions of the pages fixture — the
// only names delete-runtime-field.ts finds in the stored runtime schema;
// anything else is its 404.
var pagesRuntimeFields = map[string]bool{"hero-image": true, "priority": true}

func (f *fakeSchemaServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/collections", func(w http.ResponseWriter, _ *http.Request) {
		f.collectionsCalls++
		writeJSON(w, http.StatusOK, map[string]any{
			"collections": []any{
				map[string]any{"name": "pages", "source": "filesystem", "directory": "content/pages"},
				map[string]any{"name": "globals", "source": "database"},
			},
		})
	})
	mux.HandleFunc("GET /api/schema/{collection}", func(w http.ResponseWriter, r *http.Request) {
		collection := r.PathValue("collection")
		f.schemaCalls[collection]++
		fixture, ok := schemaFixtures[collection]
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": `Collection "` + collection + `" not found`,
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fixture))
	})
	mux.HandleFunc("GET /api/schema/{collection}/export", func(w http.ResponseWriter, r *http.Request) {
		collection := r.PathValue("collection")
		f.exportCalls[collection]++
		if collection != "pages" {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": `Collection "` + collection + `" not found`,
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"collection": collection,
			"code":       pagesZodExport,
		})
	})
	mux.HandleFunc("PUT /api/schema/{collection}/fields", f.saveField)
	mux.HandleFunc("DELETE /api/schema/{collection}/fields/{field}", f.deleteField)
	return mux
}

// saveField mirrors save-runtime-field.ts: a name owned by a code-defined
// Zod field is a 409, everything else upserts and echoes the normalized
// definition — required is `body['required'] === true`, and optional keys
// the handler normalized to undefined disappear from the JSON.
func (f *fakeSchemaServer) saveField(w http.ResponseWriter, r *http.Request) {
	f.saveFieldCalls++
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	f.lastSaveBody = body
	name, _ := body["name"].(string)
	if pagesCodeFields[name] {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": `Field "` + name + `" is defined in code and cannot be overridden`,
		})
		return
	}
	field := map[string]any{"name": name, "type": body["type"], "required": body["required"] == true}
	if description, ok := body["description"].(string); ok {
		field["description"] = description
	}
	if enumValues, ok := body["enumValues"].([]any); ok {
		field["enumValues"] = enumValues
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "Field saved", "field": field})
}

// deleteField mirrors delete-runtime-field.ts: a code-defined field is a
// 409, a name the stored runtime schema does not define is a 404, and a
// runtime field deletes with { message, field: "<name>" }.
func (f *fakeSchemaServer) deleteField(w http.ResponseWriter, r *http.Request) {
	f.deleteFieldCalls++
	field := r.PathValue("field")
	f.lastDeletedField = field
	if pagesCodeFields[field] {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": `Field "` + field + `" is defined in code and cannot be deleted`,
		})
		return
	}
	if !pagesRuntimeFields[field] {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": `Runtime field "` + field + `" not found`,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "Field deleted", "field": field})
}

// schemaFixtures hold raw response bodies so the wire property order is
// exactly what get-schema.ts emits — code fields in schema declaration
// order, runtime fields appended. (Serializing a Go map would sort the
// keys and hide order bugs.)
//
// pages: code schema z.object({ title: z.string(), description:
// z.string().describe(...).optional(), status:
// z.enum(['draft','published']).default('published') }) as zod's
// toJSONSchema emits it, merged with two runtime fields shaped by
// runtimeFieldToJsonSchema — a url field ({ _runtime, type: "string",
// format: "uri" }) and a required number field whose name the handler
// appended to required. globals: code fields only.
var schemaFixtures = map[string]string{
	"pages": `{
		"name": "pages",
		"source": "filesystem",
		"schema": {
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"type": "object",
			"properties": {
				"title": {"type": "string"},
				"description": {"type": "string", "description": "Short summary for listings"},
				"status": {"default": "published", "type": "string", "enum": ["draft", "published"]},
				"hero-image": {"_runtime": true, "type": "string", "format": "uri"},
				"priority": {"_runtime": true, "type": "number", "description": "Sort weight", "minimum": 0}
			},
			"required": ["title", "status", "priority"],
			"additionalProperties": false
		}
	}`,
	"globals": `{
		"name": "globals",
		"source": "database",
		"schema": {
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"type": "object",
			"properties": {
				"title": {"type": "string"}
			},
			"required": ["title"],
			"additionalProperties": false
		}
	}`,
}

// pagesZodExport is the export-schema.ts `code` value for the pages fixture
// — the exportSchemaAsZod-generated defineCollection source: code-defined
// fields first (jsonSchemaPropertyToZod renders no .describe() and
// JSON-stringifies defaults), runtime fields after (runtimeFieldToZodCode
// keeps descriptions and constraints), lines joined with \n and NO trailing
// newline. Multi-line with both quote styles, so the test proves the JSON
// string round-trips onto stdout byte-exactly.
const pagesZodExport = `const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: join(process.cwd(), 'content', 'pages'),
  schema: z.object({
    // Code-defined fields
    'title': z.string(),
    'description': z.string().optional(),
    'status': z.enum(['draft', 'published']).default("published"),
    // Runtime fields (added via Studio)
    'hero-image': z.string().url().optional(),
    'priority': z.number().min(0).describe('Sort weight'),
  }),
})`

// startSchemaServer starts a fresh fake schema API and returns it with a
// test-scoped credentials path.
func startSchemaServer(t *testing.T) (*fakeSchemaServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeSchemaServer{schemaCalls: map[string]int{}, exportCalls: map[string]int{}}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

// decodeFixture parses a raw JSON fixture for DeepEqual comparison with
// decoded CLI output.
func decodeFixture(t *testing.T, raw string) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("fixture is not valid JSON: %v", err)
	}
	return out
}

func TestSchemaShow(t *testing.T) {
	t.Run("list renders every collection with field counts by origin", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "list", "--api-url", srv.URL)

		if fake.collectionsCalls != 1 {
			t.Errorf("collections calls = %d, want 1", fake.collectionsCalls)
		}
		if fake.schemaCalls["pages"] != 1 || fake.schemaCalls["globals"] != 1 {
			t.Errorf("schema calls = %v, want 1 per collection", fake.schemaCalls)
		}
		for i, pattern := range []string{
			`^NAME {2,}SOURCE {2,}CODE {2,}RUNTIME$`,
			`^pages {2,}filesystem {2,}3 {2,}2$`,
			`^globals {2,}database {2,}1 {2,}0$`,
		} {
			if !regexp.MustCompile(`(?m)` + pattern).MatchString(out) {
				t.Errorf("list table line %d does not match %s\noutput:\n%s", i, pattern, out)
			}
		}
	})

	t.Run("show renders the merged field table with the code/runtime origin", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "show", "pages", "--api-url", srv.URL)

		if want := "Collection: pages (filesystem)"; !strings.Contains(out, want) {
			t.Errorf("show output missing %q\noutput:\n%s", want, out)
		}
		for i, pattern := range []string{
			`^NAME {2,}TYPE {2,}REQUIRED {2,}ORIGIN {2,}DESCRIPTION$`,
			`^title {2,}string {2,}yes {2,}code *$`,
			`^description {2,}string {2,}no {2,}code {2,}Short summary for listings$`,
			`^status {2,}enum\(draft, published\) {2,}yes {2,}code *$`,
			`^hero-image {2,}string \(uri\) {2,}no {2,}runtime *$`,
			`^priority {2,}number {2,}yes {2,}runtime {2,}Sort weight$`,
		} {
			if !regexp.MustCompile(`(?m)` + pattern).MatchString(out) {
				t.Errorf("field table line %d does not match %s\noutput:\n%s", i, pattern, out)
			}
		}
		// Rows must keep the wire order: code fields in declaration order,
		// runtime fields after them.
		last := -1
		for _, name := range []string{"title", "description", "status", "hero-image", "priority"} {
			idx := strings.Index(out, "\n"+name)
			if idx < 0 {
				t.Fatalf("field row %q not found\noutput:\n%s", name, out)
			}
			if idx < last {
				t.Errorf("field %q rendered out of wire order\noutput:\n%s", name, out)
			}
			last = idx
		}
	})

	t.Run("show --json emits the raw schema response", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "show", "pages", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		// The fixture carries keys the typed structs never decode
		// ($schema, additionalProperties, default, minimum) — DeepEqual
		// against the full body proves raw passthrough.
		if want := decodeFixture(t, schemaFixtures["pages"]); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("list --json combines the raw responses", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "list", "--json", "--api-url", srv.URL)

		var got struct {
			Collections map[string]any            `json:"collections"`
			Schemas     map[string]map[string]any `json:"schemas"`
		}
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if roster, ok := got.Collections["collections"].([]any); !ok || len(roster) != 2 {
			t.Errorf("--json collections roster not passed through\noutput:\n%s", out)
		}
		for name, fixture := range schemaFixtures {
			if want := decodeFixture(t, fixture); !reflect.DeepEqual(got.Schemas[name], want) {
				t.Errorf("--json schema %q differs from server response\ngot:  %#v\nwant: %#v",
					name, got.Schemas[name], want)
			}
		}
	})

	t.Run("unknown collection surfaces the API 404 and a non-zero exit", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "show", "blog", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for unknown collection, got success\noutput:\n%s", out)
		}
		want := `Collection "blog" not found`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})
}

func TestSchemaExport(t *testing.T) {
	t.Run("export writes the Zod source verbatim to stdout", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "export", "pages", "--api-url", srv.URL)

		if fake.exportCalls["pages"] != 1 {
			t.Errorf("export calls = %d, want 1", fake.exportCalls["pages"])
		}
		// The generated source plus the text-file-terminating newline and
		// nothing else — `krantho schema export pages > schema.ts` must yield
		// the file exactly as the server generated it.
		if want := pagesZodExport + "\n"; out != want {
			t.Errorf("stdout is not the verbatim Zod source\ngot:  %q\nwant: %q", out, want)
		}
	})

	t.Run("export --json emits the raw envelope", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "export", "pages", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := map[string]any{"collection": "pages", "code": pagesZodExport}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("unknown collection surfaces the API 404 and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "export", "blog", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for unknown collection, got success\noutput:\n%s", out)
		}
		if fake.exportCalls["blog"] != 1 {
			t.Errorf("export calls = %d, want 1", fake.exportCalls["blog"])
		}
		want := `Collection "blog" not found`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})
}
