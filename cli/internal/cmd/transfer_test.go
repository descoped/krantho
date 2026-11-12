package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// fakeTransferServer serves the transfer endpoints with the shapes of the
// real handlers: GET /api/content/:collection/export (export-content.ts),
// POST /api/content/:collection/import (import-content.ts),
// GET /api/export/bundle (export-bundle.ts), and POST /api/import/bundle
// (import-bundle.ts). An unknown collection is the validator's 404
// (validators.ts validateCollectionParam).
type fakeTransferServer struct {
	exportCalls      map[string]int
	lastExportQuery  url.Values
	bundleExports    int
	denyBundle       bool
	importCalls      int
	lastImportBody   map[string]any
	bundleImports    int
	lastBundleBody   map[string]any
	failBundleImport bool
}

func (f *fakeTransferServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/content/{collection}/export", f.exportContent)
	mux.HandleFunc("POST /api/content/{collection}/import", f.importContent)
	mux.HandleFunc("GET /api/export/bundle", f.exportBundle)
	mux.HandleFunc("POST /api/import/bundle", f.importBundle)
	return mux
}

// exportContent mirrors export-content.ts: format=json returns the
// { collection, format, count, items } envelope, format=markdown returns
// { collection, format, count, files } with ready-made file content —
// `---` fences, one `key: JSON.stringify(value)` line per field, then the
// body with no separating blank line.
func (f *fakeTransferServer) exportContent(w http.ResponseWriter, r *http.Request) {
	collection := r.PathValue("collection")
	f.exportCalls[collection]++
	f.lastExportQuery = r.URL.Query()
	if collection != "pages" && collection != "tricky" {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": `Collection "` + collection + `" not found`,
		})
		return
	}
	if r.URL.Query().Get("format") != "markdown" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(pagesExportJSON))
		return
	}
	if collection == "tricky" {
		// A hostile slug — the CLI must refuse to write it as a filename.
		writeJSON(w, http.StatusOK, map[string]any{
			"collection": "tricky", "format": "markdown", "count": 1,
			"files": []any{map[string]any{"slug": "../evil", "content": "---\ntitle: \"X\"\n---\nboom\n"}},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"collection": "pages", "format": "markdown", "count": 2,
		"files": []any{
			map[string]any{"slug": "about", "content": aboutMarkdown},
			map[string]any{"slug": "team", "content": teamMarkdown},
		},
	})
}

// importContent mirrors import-content.ts: per-item outcomes travel in the
// 200 results array — the "broken" slug fails the way a schema validation
// failure does (formatZodErrors joins "field: message"), everything else
// imports.
func (f *fakeTransferServer) importContent(w http.ResponseWriter, r *http.Request) {
	collection := r.PathValue("collection")
	f.importCalls++
	if collection != "pages" {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": `Collection "` + collection + `" not found`,
		})
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	f.lastImportBody = body
	items, _ := body["items"].([]any)
	imported := 0
	results := make([]any, 0, len(items))
	for _, raw := range items {
		item, _ := raw.(map[string]any)
		identity, _ := item["identity"].(map[string]any)
		slug, _ := identity["slug"].(string)
		if slug == "broken" {
			results = append(results, map[string]any{
				"slug": slug, "imported": false, "error": "title: Required",
			})
			continue
		}
		imported++
		results = append(results, map[string]any{"slug": slug, "imported": true})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"collection": collection, "imported": imported, "total": len(items), "results": results,
	})
}

// exportBundle mirrors export-bundle.ts: the full bundle as one JSON body,
// or requireRole's 403 when the fake denies admin.
func (f *fakeTransferServer) exportBundle(w http.ResponseWriter, _ *http.Request) {
	f.bundleExports++
	if f.denyBundle {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "Insufficient permissions. Required: admin, have: viewer",
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(bundleFixture))
}

// importBundle mirrors import-bundle.ts: 200 with { imported, skipped,
// errors?, checkpoint } — failures travel in the errors array (the errors
// key is absent when nothing failed, like the handler's undefined).
func (f *fakeTransferServer) importBundle(w http.ResponseWriter, r *http.Request) {
	f.bundleImports++
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	f.lastBundleBody = body
	if f.failBundleImport {
		writeJSON(w, http.StatusOK, map[string]any{
			"imported": 1, "skipped": 0, "checkpoint": "created",
			"errors": []any{
				map[string]any{"collection": "legacy", "slug": "home", "error": `Collection "legacy" not found`},
				map[string]any{"collection": "pages", "slug": "about", "error": "Write failed"},
			},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"imported": 2, "skipped": 1, "checkpoint": "created",
	})
}

// pagesExportJSON is the raw export-content.ts format=json response for the
// pages fixture — ContentDocument items passed through as { meta, fields,
// body }, kept as a raw string so wire order and untyped keys prove raw
// passthrough.
const pagesExportJSON = `{
  "collection": "pages",
  "format": "json",
  "count": 2,
  "items": [
    {
      "fields": {
        "title": "About Us",
        "description": "Who we are: the team",
        "order": 2,
        "featured": true
      },
      "body": "# About\n\nWe build things.\n",
      "identity": {
        "collection": "pages",
        "slug": "about",
        "locale": "en"
      },
      "contract": null,
      "metadata": {
        "sharing": {
          "description": "Portable description"
        }
      },
      "defaults": [],
      "basis": {
        "checksum": "baseline-about",
        "version": 3
      }
    },
    {
      "fields": {
        "title": "Team"
      },
      "body": "# Team\n",
      "identity": {
        "collection": "pages",
        "slug": "team",
        "locale": "nb"
      },
      "contract": null,
      "metadata": {},
      "defaults": [],
      "basis": {
        "checksum": "baseline-team",
        "version": 1
      }
    }
  ]
}`

// aboutMarkdown and teamMarkdown are export-content.ts format=markdown file
// contents: `---\n<key>: <JSON.stringify(value)>\n---\n<body>` — every
// value JSON-encoded, no blank line between the closing fence and the body.
const aboutMarkdown = "---\nidentity: {\"collection\":\"pages\",\"slug\":\"about\",\"locale\":\"en\"}\ncontract: null\nmetadata: {}\ndefaults: []\ntitle: \"About Us\"\ndescription: \"Who we are: the team\"\norder: 2\nfeatured: true\n---\n# About\n\nWe build things.\n"

const teamMarkdown = "---\nidentity: {\"collection\":\"pages\",\"slug\":\"team\",\"locale\":\"nb\"}\ncontract: null\nmetadata: {}\ndefaults: []\ntitle: \"Team\"\n---\n# Team\n"

// bundleFixture is the raw export-bundle.ts response: version, timestamp,
// slug-keyed content per collection, media metadata, runtime schemas,
// checksums, and warnings — the CLI models only version and content, so
// the rest proves verbatim passthrough on both export and import.
const bundleFixture = `{
  "version": 4,
  "timestamp": "2026-07-02T08:00:00.000Z",
  "content": {
    "pages": [
      {
        "identity": {
          "collection": "pages",
          "slug": "about",
          "locale": "en"
        },
        "contract": null,
        "fields": {
          "title": "About Us"
        },
        "metadata": {},
        "defaults": [],
        "body": "# About\n"
      },
      {
        "identity": {
          "collection": "pages",
          "slug": "team",
          "locale": "en"
        },
        "contract": null,
        "fields": {
          "title": "Team"
        },
        "metadata": {},
        "defaults": [],
        "body": "# Team\n"
      }
    ],
    "globals": [
      {
        "identity": {
          "collection": "globals",
          "slug": "footer",
          "locale": "en"
        },
        "contract": null,
        "fields": {
          "title": "Footer"
        },
        "metadata": {},
        "defaults": [],
        "body": ""
      }
    ]
  },
  "media": {
    "items": []
  },
  "schemas": {
    "pages": [
      {
        "name": "hero-image",
        "type": "url",
        "required": false
      }
    ]
  },
  "checksums": {
    "pages/about": "abc123",
    "pages/team": "def456",
    "globals/footer": "0a0b0c"
  },
  "warnings": [
    {
      "collection": "pages",
      "slug": "team",
      "field": "description",
      "message": "Required"
    }
  ]
}`

// startTransferServer starts a fresh fake transfer API and returns it with
// a test-scoped credentials path.
func startTransferServer(t *testing.T) (*fakeTransferServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeTransferServer{exportCalls: map[string]int{}}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

func TestExportCollection(t *testing.T) {
	t.Run("export prints the raw JSON envelope", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		out := runCLI(t, credsPath, "export", "pages", "--api-url", srv.URL)

		if fake.exportCalls["pages"] != 1 {
			t.Errorf("export calls = %d, want 1", fake.exportCalls["pages"])
		}
		if got := fake.lastExportQuery.Get("format"); got != "json" {
			t.Errorf("format query = %q, want %q", got, "json")
		}
		if _, ok := fake.lastExportQuery["locale"]; ok {
			t.Errorf("locale query sent without --locale: %v", fake.lastExportQuery)
		}
		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("export output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		// The envelope carries keys the typed structs never decode (meta
		// blocks, count) — DeepEqual against the full body proves raw
		// passthrough.
		if want := decodeFixture(t, pagesExportJSON); !reflect.DeepEqual(got, want) {
			t.Errorf("export output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("--locale passes the filter through", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		runCLI(t, credsPath, "export", "pages", "--locale", "nb", "--api-url", srv.URL)

		if got := fake.lastExportQuery.Get("locale"); got != "nb" {
			t.Errorf("locale query = %q, want %q", got, "nb")
		}
	})

	t.Run("--out writes one markdown file per document verbatim", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		dir := filepath.Join(t.TempDir(), "exported")

		out := runCLI(t, credsPath, "export", "pages", "--out", dir, "--api-url", srv.URL)

		if got := fake.lastExportQuery.Get("format"); got != "markdown" {
			t.Errorf("format query = %q, want %q", got, "markdown")
		}
		for name, want := range map[string]string{"about.md": aboutMarkdown, "team.md": teamMarkdown} {
			data, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				t.Fatalf("read exported file: %v", err)
			}
			// Byte-exact: the server-built content is written verbatim.
			if string(data) != want {
				t.Errorf("%s content\ngot:  %q\nwant: %q", name, string(data), want)
			}
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read export dir: %v", err)
		}
		if len(entries) != 2 {
			t.Errorf("exported files = %d, want 2", len(entries))
		}
		if want := "Exported 2 documents from pages to " + dir + "\n"; out != want {
			t.Errorf("summary = %q, want %q", out, want)
		}
	})

	t.Run("--out refuses a slug that escapes the directory", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)
		parent := t.TempDir()
		dir := filepath.Join(parent, "out")

		out, err := execCLI(t, credsPath, "export", "tricky", "--out", dir, "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for hostile slug, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "not a safe filename") {
			t.Errorf("error = %q, want it to refuse the unsafe filename", err.Error())
		}
		if _, statErr := os.Stat(filepath.Join(parent, "evil.md")); !os.IsNotExist(statErr) {
			t.Errorf("hostile slug escaped the output directory: %v", statErr)
		}
	})

	t.Run("--json with --out is rejected before any request", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		out, err := execCLI(t, credsPath, "export", "pages", "--out", t.TempDir(),
			"--json", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for --json with --out, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "cannot be combined") {
			t.Errorf("error = %q, want it to explain the conflict", err.Error())
		}
		if fake.exportCalls["pages"] != 0 {
			t.Errorf("export calls = %d, want 0 (client-side validation must reject first)", fake.exportCalls["pages"])
		}
	})

	t.Run("export without a collection or --bundle errors", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		_, err := execCLI(t, credsPath, "export", "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for export without arguments, got success")
		}
		if !strings.Contains(err.Error(), "collection argument") {
			t.Errorf("error = %q, want it to ask for a collection", err.Error())
		}
		if fake.bundleExports != 0 || len(fake.exportCalls) != 0 {
			t.Errorf("requests made despite invalid invocation: %v, %d", fake.exportCalls, fake.bundleExports)
		}
	})

	t.Run("unknown collection surfaces the API 404 and a non-zero exit", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)

		out, err := execCLI(t, credsPath, "export", "blog", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for unknown collection, got success\noutput:\n%s", out)
		}
		if want := `Collection "blog" not found`; !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
	})
}

func TestExportBundle(t *testing.T) {
	t.Run("writes the raw bundle to a file with a summary", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		file := filepath.Join(t.TempDir(), "site.json")

		out := runCLI(t, credsPath, "export", "--bundle", file, "--api-url", srv.URL)

		if fake.bundleExports != 1 {
			t.Errorf("bundle exports = %d, want 1", fake.bundleExports)
		}
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read bundle file: %v", err)
		}
		var got map[string]any
		if err := json.Unmarshal(data, &got); err != nil {
			t.Fatalf("bundle file is not valid JSON: %v", err)
		}
		// checksums, warnings, media, and schemas are untyped in the CLI —
		// their survival proves the bundle is written verbatim.
		if want := decodeFixture(t, bundleFixture); !reflect.DeepEqual(got, want) {
			t.Errorf("bundle file differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
		if want := "Exported bundle version 4 (2 collections, 3 documents) to " + file + "\n"; out != want {
			t.Errorf("summary = %q, want %q", out, want)
		}
	})

	t.Run("--bundle - streams the bundle to stdout", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)

		out := runCLI(t, credsPath, "export", "--bundle", "-", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("stdout bundle is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := decodeFixture(t, bundleFixture); !reflect.DeepEqual(got, want) {
			t.Errorf("stdout bundle differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("--bundle with a collection argument is rejected before any request", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		_, err := execCLI(t, credsPath, "export", "pages", "--bundle", "x.json", "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for --bundle with a collection, got success")
		}
		if !strings.Contains(err.Error(), "drop the collection argument") {
			t.Errorf("error = %q, want it to explain the conflict", err.Error())
		}
		if fake.bundleExports != 0 {
			t.Errorf("bundle exports = %d, want 0", fake.bundleExports)
		}
	})

	t.Run("permission denial surfaces the 403 and writes no file", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		fake.denyBundle = true
		file := filepath.Join(t.TempDir(), "site.json")

		out, err := execCLI(t, credsPath, "export", "--bundle", file, "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for denied bundle export, got success\noutput:\n%s", out)
		}
		if want := "Insufficient permissions"; !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if _, statErr := os.Stat(file); !os.IsNotExist(statErr) {
			t.Errorf("bundle file created despite the denied export: %v", statErr)
		}
	})
}
