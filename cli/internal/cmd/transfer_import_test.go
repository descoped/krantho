package cmd

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// writeTempFile writes content into a fresh temp-dir file and returns its path.
func writeTempFile(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return path
}

func TestImportCollection(t *testing.T) {
	t.Run("a JSON export round-trips authored values and repository basis", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "pages.json", pagesExportJSON)

		out := runCLI(t, credsPath, "import", "pages", file, "--api-url", srv.URL)

		if fake.importCalls != 1 {
			t.Errorf("import calls = %d, want 1", fake.importCalls)
		}
		var exported map[string]any
		if err := json.Unmarshal([]byte(pagesExportJSON), &exported); err != nil {
			t.Fatal(err)
		}
		want := map[string]any{"items": exported["items"]}
		if !reflect.DeepEqual(fake.lastImportBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastImportBody, want)
		}
		if wantOut := "Imported 2/2 documents into pages\n"; out != wantOut {
			t.Errorf("summary = %q, want %q", out, wantOut)
		}
	})

	t.Run("a bare JSON array of portable documents imports", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "items.json",
			`[{"fields": {"title": "Contact"}, "body": "# Contact\n", "identity": {"collection": "pages", "slug": "contact", "locale": "en"}, "contract": null, "metadata": {}, "defaults": []}]`)

		out := runCLI(t, credsPath, "import", "pages", file, "--api-url", srv.URL)

		want := roundTripJSON(t, map[string]any{
			"items": []any{map[string]any{
				"identity": map[string]any{"collection": "pages", "slug": "contact", "locale": "en"}, "contract": nil, "metadata": map[string]any{}, "defaults": []any{}, "fields": map[string]any{"title": "Contact"}, "body": "# Contact\n",
			}},
		})
		if !reflect.DeepEqual(fake.lastImportBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastImportBody, want)
		}
		if wantOut := "Imported 1/1 documents into pages\n"; out != wantOut {
			t.Errorf("summary = %q, want %q", out, wantOut)
		}
	})

	t.Run("--dir parses frontmatter and body from every .md file", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		dir := t.TempDir()
		// about.md is output.MarkdownDocument's shape: sorted keys, JSON
		// encoding for anything not a plain scalar, a blank line before the
		// body. team.md is the export handler's shape: no blank line.
		writeFile := func(name, content string) {
			t.Helper()
			if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
				t.Fatalf("write %s: %v", name, err)
			}
		}
		writeFile("about.md",
			"---\nidentity: {\"collection\":\"pages\",\"slug\":\"about\",\"locale\":\"en\"}\ncontract: null\nmetadata: {}\ndefaults: []\ndescription: \"Who we are: the team\"\nfeatured: true\norder: 2\ntitle: About Us\n---\n\n# About\n\nWe build things.\n")
		writeFile("team.md", teamMarkdown)
		writeFile("notes.txt", "not content")

		out := runCLI(t, credsPath, "import", "pages", "--dir", dir, "--api-url", srv.URL)

		want := roundTripJSON(t, map[string]any{
			"items": []any{
				map[string]any{
					"identity": map[string]any{"collection": "pages", "slug": "about", "locale": "en"}, "contract": nil, "metadata": map[string]any{}, "defaults": []any{},
					"fields": map[string]any{
						"description": "Who we are: the team", "featured": true,
						"order": 2, "title": "About Us",
					},
					"body": "\n# About\n\nWe build things.\n",
				},
				map[string]any{
					"identity": map[string]any{"collection": "pages", "slug": "team", "locale": "nb"}, "contract": nil, "metadata": map[string]any{}, "defaults": []any{},
					"fields": map[string]any{"title": "Team"},
					"body":   "# Team\n",
				},
			},
		})
		if !reflect.DeepEqual(fake.lastImportBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastImportBody, want)
		}
		if wantOut := "Imported 2/2 documents into pages\n"; out != wantOut {
			t.Errorf("summary = %q, want %q", out, wantOut)
		}
	})

	t.Run("failed documents are listed and exit non-zero", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "items.json",
			`[{"fields": {}, "body": "", "identity": {"collection": "pages", "slug": "about", "locale": "en"}, "contract": null, "metadata": {}, "defaults": []}, {"fields": {}, "body": "", "identity": {"collection": "pages", "slug": "broken", "locale": "en"}, "contract": null, "metadata": {}, "defaults": []}]`)

		out, err := execCLI(t, credsPath, "import", "pages", file, "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for failed items, got success\noutput:\n%s", out)
		}
		if want := "1 of 2 documents failed to import"; err.Error() != want {
			t.Errorf("error = %q, want %q", err.Error(), want)
		}
		for _, want := range []string{
			"Imported 1/2 documents into pages\n",
			"  failed broken: title: Required\n",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("output missing %q\noutput:\n%s", want, out)
			}
		}
	})

	t.Run("--json emits the raw import response", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "items.json",
			`[{"fields": {"title": "Contact"}, "body": "", "identity": {"collection": "pages", "slug": "contact", "locale": "en"}, "contract": null, "metadata": {}, "defaults": []}]`)

		out := runCLI(t, credsPath, "import", "pages", file, "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"collection": "pages", "imported": 1, "total": 1,
			"results": []any{map[string]any{"slug": "contact", "imported": true}},
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("a file argument and --dir cannot be combined", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		_, err := execCLI(t, credsPath, "import", "pages", "items.json",
			"--dir", t.TempDir(), "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for file argument with --dir, got success")
		}
		if !strings.Contains(err.Error(), "--dir needs exactly a collection") {
			t.Errorf("error = %q, want it to explain the conflict", err.Error())
		}
		if fake.importCalls != 0 {
			t.Errorf("import calls = %d, want 0 (client-side validation must reject first)", fake.importCalls)
		}
	})

	t.Run("a file without frontmatter fences fails before any request", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "bad.md"), []byte("no fences here\n"), 0o644); err != nil {
			t.Fatalf("write bad.md: %v", err)
		}

		_, err := execCLI(t, credsPath, "import", "pages", "--dir", dir, "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for missing fences, got success")
		}
		for _, want := range []string{"bad.md", `missing opening "---" frontmatter fence`} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error = %q, want it to contain %q", err.Error(), want)
			}
		}
		if fake.importCalls != 0 {
			t.Errorf("import calls = %d, want 0 (parse failure must reject first)", fake.importCalls)
		}
	})
}

func TestImportBundle(t *testing.T) {
	t.Run("posts the bundle verbatim and summarizes", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "site.json", bundleFixture)

		out := runCLI(t, credsPath, "import", "--bundle", file, "--api-url", srv.URL)

		if fake.bundleImports != 1 {
			t.Errorf("bundle imports = %d, want 1", fake.bundleImports)
		}
		// checksums, media, schemas, and warnings are untyped in the CLI —
		// their arrival proves the bundle travels verbatim.
		if want := decodeFixture(t, bundleFixture); !reflect.DeepEqual(fake.lastBundleBody, want) {
			t.Errorf("request body differs from the bundle file\ngot:  %#v\nwant: %#v", fake.lastBundleBody, want)
		}
		if want := "Imported 2 documents, skipped 1 unchanged (checkpoint created)\n"; out != want {
			t.Errorf("summary = %q, want %q", out, want)
		}
	})

	t.Run("server-side failures are listed and exit non-zero", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		fake.failBundleImport = true
		file := writeTempFile(t, "site.json", bundleFixture)

		out, err := execCLI(t, credsPath, "import", "--bundle", file, "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for failed bundle import, got success\noutput:\n%s", out)
		}
		if want := "2 documents failed to import"; err.Error() != want {
			t.Errorf("error = %q, want %q", err.Error(), want)
		}
		for _, want := range []string{
			"Imported 1 documents, skipped 0 unchanged (checkpoint created)\n",
			"  failed legacy/home: Collection \"legacy\" not found\n",
			"  failed pages/about: Write failed\n",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("output missing %q\noutput:\n%s", want, out)
			}
		}
	})

	t.Run("--json emits the raw import response", func(t *testing.T) {
		_, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "site.json", bundleFixture)

		out := runCLI(t, credsPath, "import", "--bundle", file, "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{"imported": 2, "skipped": 1, "checkpoint": "created"})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("an invalid JSON file fails before any request", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)
		file := writeTempFile(t, "site.json", "not json")

		_, err := execCLI(t, credsPath, "import", "--bundle", file, "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for invalid JSON, got success")
		}
		if !strings.Contains(err.Error(), "not valid JSON") {
			t.Errorf("error = %q, want it to name the invalid JSON", err.Error())
		}
		if fake.bundleImports != 0 {
			t.Errorf("bundle imports = %d, want 0 (client-side validation must reject first)", fake.bundleImports)
		}
	})

	t.Run("--bundle with collection arguments is rejected before any request", func(t *testing.T) {
		fake, srv, credsPath := startTransferServer(t)

		_, err := execCLI(t, credsPath, "import", "pages", "--bundle", "site.json", "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for --bundle with a collection, got success")
		}
		if !strings.Contains(err.Error(), "drop the collection/file arguments") {
			t.Errorf("error = %q, want it to explain the conflict", err.Error())
		}
		if fake.bundleImports != 0 {
			t.Errorf("bundle imports = %d, want 0", fake.bundleImports)
		}
	})
}

// TestImportDirPreservesLeadingBlankLine documents the known parser ambiguity:
// one parser serves both the hand-authored convention (blank line after the
// closing fence) and export-content.ts (no separator), so a body that
// genuinely BEGINS with a blank line loses it importing from a directory.
func TestImportDirPreservesLeadingBlankLine(t *testing.T) {
	fake := &fakeTransferServer{exportCalls: map[string]int{}}
	srv := httptest.NewServer(fake.handler())
	defer srv.Close()

	dir := t.TempDir()
	file := filepath.Join(dir, "spaced.md")
	// export-content.ts format for a stored body of "\nHello" — no separator,
	// so the file shows one blank line that IS body content.
	if err := os.WriteFile(file, []byte("---\nidentity: {\"collection\":\"pages\",\"slug\":\"spaced\",\"locale\":\"en\"}\ncontract: null\nmetadata: {}\ndefaults: []\ntitle: \"Spaced\"\n---\n\nHello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	credsPath := filepath.Join(t.TempDir(), "credentials.json")
	runCLI(t, credsPath, "--api-url", srv.URL, "import", "pages", "--dir", dir)

	items, ok := fake.lastImportBody["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("imported items = %#v, want exactly 1", fake.lastImportBody["items"])
	}
	got := items[0].(map[string]any)["body"]
	if got != "\nHello\n" {
		t.Fatalf("body %q — leading blank line must be preserved (want %q)", got, "\nHello\n")
	}
}
