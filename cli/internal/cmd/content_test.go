package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/descoped/krantho/cli/internal/creds"
)

// fakeContentServer serves GET /api/content/pages with the response shape of
// packages/api/src/handlers/list-collection.ts ({ items, hasMore } where items
// are persistence ContentDocument values: meta + fields + body + html +
// sections) and GET /api/content/pages/:slug with the adapter path of
// get-content.ts (the persistence ContentDocument as-is; the engine fallback
// path synthesizes the same shape). Unknown slugs get the handler's 404
// `Content "<slug>" not found in "<collection>"` error body.
//
// POST /api/content/pages mirrors create-content.ts: it reads slug, fields,
// body, and locale from the JSON body and answers 201
// { slug, collection, message: "Created" }. The slug "invalid" answers the
// handler's 422 schema-validation failure. create-content.ts has NO
// duplicate-slug error — writeContent appends a new version — so the fake
// deliberately models none.
//
// PUT /api/content/pages/:slug mirrors update-content.ts: it reads fields,
// body, and _version from the JSON body; a numeric _version differing from
// the stored meta.version answers the handler's 409
// { error: "Content has been modified by another user", currentVersion,
// yourVersion }, otherwise 200 { slug, collection, message: "Updated" }.
//
// DELETE /api/content/pages/:slug mirrors delete-content.ts: no request
// body; the slug "referenced" answers the handler's reference-integrity 409
// { error: "Cannot delete: referenced by other content", references },
// otherwise 200 { slug, collection, message: "Deleted" }.
//
// POST /api/content/pages/:slug/publish mirrors publish-content.ts: an
// unknown slug is its 404 `Content "pages/<slug>" (en) not found`; a body
// with a status key publishes, unpublishes or archives (200 { slug,
// collection, locale, status, version, liveVersion, message }); a body-less
// POST takes the toggle path from the stored published document.
//
// GET /api/content/search mirrors search-content.ts: a trimmed, lowercased
// q shorter than 2 characters is its 400 { error: "Search query must be at
// least 2 characters" }; otherwise every fixture document whose slug, body,
// or JSON-encoded fields contain the query — restricted to ?locale when
// present — is a hit, returned as { items, hasMore } with items of
// { meta, fields, snippet }: no body, HTML or sections.
type fakeContentServer struct {
	listCalls    int
	getCalls     int
	createCalls  int
	updateCalls  int
	deleteCalls  int
	publishCalls int
	searchCalls  int
	lastQuery    url.Values
	lastAuth     string // Authorization header seen on the last list request
	// lastSearchQuery and lastSearchRawQuery are the decoded query params and
	// the wire-format (still URL-encoded) query string of the last search
	// request.
	lastSearchQuery    url.Values
	lastSearchRawQuery string
	// lastCreateBody is the decoded JSON body of the last create request.
	lastCreateBody map[string]any
	// lastUpdateBody is the decoded JSON body of the last update request.
	lastUpdateBody map[string]any
	// lastPublishSlug and lastPublishBody are the URL slug and decoded JSON
	// body of the last publish request.
	lastPublishSlug string
	lastPublishBody map[string]any
	// storedVersion is the version the PUT handler treats as current —
	// update-content.ts compares the submitted _version against the stored
	// meta.version. startContentServer seeds it with pageAboutFixture's
	// meta.version; a test bumping it models a concurrent edit landing
	// between the CLI's read and its write.
	storedVersion int
}

func (f *fakeContentServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/content/pages", func(w http.ResponseWriter, r *http.Request) {
		f.listCalls++
		f.lastQuery = r.URL.Query()
		f.lastAuth = r.Header.Get("Authorization")
		writeJSON(w, http.StatusOK, pagesListFixture())
	})
	mux.HandleFunc("POST /api/content/pages", func(w http.ResponseWriter, r *http.Request) {
		f.createCalls++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			// validateRequestBody's 400 shape (validators.ts).
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Request body must be a JSON object",
			})
			return
		}
		f.lastCreateBody = body
		slug, _ := body["slug"].(string)
		if slug == "invalid" {
			writeJSON(w, http.StatusUnprocessableEntity, createValidationFailureFixture())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"slug":       slug,
			"collection": "pages",
			"message":    "Created",
		})
	})
	mux.HandleFunc("GET /api/content/search", func(w http.ResponseWriter, r *http.Request) {
		f.searchCalls++
		f.lastSearchQuery = r.URL.Query()
		f.lastSearchRawQuery = r.URL.RawQuery
		query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
		if len(query) < 2 {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Search query must be at least 2 characters",
			})
			return
		}
		locale := r.URL.Query().Get("locale")
		items := []any{}
		for _, raw := range pagesListFixture()["items"].([]any) {
			doc := raw.(map[string]any)
			meta := doc["meta"].(map[string]any)
			if locale != "" && meta["locale"] != locale {
				continue
			}
			// Fixture maps marshal without error; search-content.ts matches
			// against JSON.stringify(item.fields), field names included.
			fields, _ := json.Marshal(doc["fields"])
			slugMatch := strings.Contains(strings.ToLower(meta["slug"].(string)), query)
			bodyMatch := strings.Contains(strings.ToLower(doc["body"].(string)), query)
			fieldsMatch := strings.Contains(strings.ToLower(string(fields)), query)
			if slugMatch || bodyMatch || fieldsMatch {
				items = append(items, searchHitOf(doc))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items, "hasMore": false})
	})
	mux.HandleFunc("PUT /api/content/pages/{slug}", func(w http.ResponseWriter, r *http.Request) {
		f.updateCalls++
		slug := r.PathValue("slug")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			// validateRequestBody's 400 shape (validators.ts).
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "Request body must be a JSON object",
			})
			return
		}
		f.lastUpdateBody = body
		// update-content.ts optimistic concurrency: only a JSON number
		// _version is checked, and a mismatch with the stored version is
		// the handler's 409.
		if version, ok := body["_version"].(float64); ok && int(version) != f.storedVersion {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error":          "Content has been modified by another user",
				"currentVersion": f.storedVersion,
				"yourVersion":    int(version),
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"slug":       slug,
			"collection": "pages",
			"message":    "Updated",
		})
	})
	mux.HandleFunc("GET /api/content/pages/{slug}", func(w http.ResponseWriter, r *http.Request) {
		f.getCalls++
		slug := r.PathValue("slug")
		if slug != "about" {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": fmt.Sprintf("Content %q not found in %q", slug, "pages"),
			})
			return
		}
		writeJSON(w, http.StatusOK, pageAboutFixture())
	})
	mux.HandleFunc("DELETE /api/content/pages/{slug}", func(w http.ResponseWriter, r *http.Request) {
		f.deleteCalls++
		slug := r.PathValue("slug")
		// delete-content.ts reference integrity: a document other content
		// references is refused with a 409 carrying the referencing items
		// ({ collection, slug, field } from findReferencingItems).
		if slug == "referenced" {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": "Cannot delete: referenced by other content",
				"references": []any{
					map[string]any{"collection": "pages", "slug": "about", "field": "related"},
				},
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"slug":       slug,
			"collection": "pages",
			"message":    "Deleted",
		})
	})
	mux.HandleFunc("POST /api/content/pages/{slug}/publish", func(w http.ResponseWriter, r *http.Request) {
		f.publishCalls++
		f.lastPublishSlug = r.PathValue("slug")
		if f.lastPublishSlug != "about" {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": fmt.Sprintf("Content %q (en) not found", "pages/"+f.lastPublishSlug),
			})
			return
		}
		// publish-content.ts treats the body as optional.
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.lastPublishBody = body
		status, _ := body["status"].(string)
		if status == "" {
			// toggleStatus: the stored document is published, so a
			// body-less POST unpublishes. The CLI never takes this path —
			// landing here means it dropped its explicit status body.
			writeJSON(w, http.StatusOK, map[string]any{
				"slug":        f.lastPublishSlug,
				"collection":  "pages",
				"locale":      "en",
				"status":      "draft",
				"version":     2,
				"liveVersion": nil,
				"message":     "Unpublished",
			})
			return
		}
		// An explicit status: published makes v2 live; draft and archived leave nothing live
		var live any
		message := map[string]string{"draft": "Unpublished", "archived": "Archived"}[status]
		if status == "published" {
			live = 2
			message = "Published"
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"slug":        f.lastPublishSlug,
			"collection":  "pages",
			"locale":      "en",
			"status":      status,
			"version":     2,
			"liveVersion": live,
			"message":     message,
		})
	})
	return mux
}

// pageAboutFixture is the get-content.ts adapter-path response body — a
// persistence ContentDocument — also reused as a list-collection.ts item.
func pageAboutFixture() map[string]any {
	return map[string]any{
		"meta": map[string]any{
			"collection": "pages",
			"slug":       "about",
			"locale":     "en",
			"version":    3,
			"status":     "published",
			"source":     "filesystem",
			"changedBy":  nil,
			"createdAt":  "2026-06-01T10:00:00.000Z",
		},
		"fields": map[string]any{
			"title":       "About Us",
			"description": "Who we are",
			"status":      "published",
			"featured":    true,
		},
		"body":     "# About\n\nWho we are.",
		"html":     "<h1>About</h1>\n<p>Who we are.</p>",
		"sections": map[string]any{},
	}
}

// pagesListFixture is the list-collection.ts response body.
func pagesListFixture() map[string]any {
	return map[string]any{
		"items": []any{
			pageAboutFixture(),
			map[string]any{
				"meta": map[string]any{
					"collection": "pages",
					"slug":       "contact",
					"locale":     "no",
					"version":    1,
					"status":     "draft",
					"source":     "api",
					"changedBy":  "admin@local",
					"createdAt":  "2026-06-10T09:30:00.000Z",
				},
				"fields": map[string]any{
					"title":       "Contact",
					"description": "Get in touch",
					"status":      "draft",
				},
				"body":     "## Email\n\npost@example.com",
				"html":     "<h2>Email</h2>\n<p>post@example.com</p>",
				"sections": map[string]any{"Email": "post@example.com"},
			},
		},
		"hasMore": false,
	}
}

// createValidationFailureFixture is create-content.ts's 422 response body:
// { error: 'Validation failed', details: formatZodErrors(issues) } where
// each details item is { field, message } (validators.ts formatZodErrors).
func createValidationFailureFixture() map[string]any {
	return map[string]any{
		"error": "Validation failed",
		"details": []any{
			map[string]any{"field": "title", "message": "Required"},
		},
	}
}

// startContentServer starts a fresh fake content API and returns it with a
// test-scoped credentials path. storedVersion starts at pageAboutFixture's
// meta.version so an unchanged document PUTs back cleanly.
func startContentServer(t *testing.T) (*fakeContentServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeContentServer{storedVersion: 3}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

func TestContentList(t *testing.T) {
	t.Run("renders table with slug title status locale", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "list", "pages", "--api-url", srv.URL)

		if fake.listCalls != 1 {
			t.Errorf("list calls = %d, want 1", fake.listCalls)
		}
		if len(fake.lastQuery) != 0 {
			t.Errorf("unfiltered list sent query params %v, want none", fake.lastQuery)
		}
		if fake.lastAuth != "" {
			t.Errorf("anonymous list sent Authorization %q, want none", fake.lastAuth)
		}
		for i, pattern := range []string{
			`^SLUG {2,}TITLE {2,}STATUS {2,}LOCALE$`,
			`^about {2,}About Us {2,}published {2,}en$`,
			`^contact {2,}Contact {2,}draft {2,}no$`,
		} {
			if !regexp.MustCompile(`(?m)` + pattern).MatchString(out) {
				t.Errorf("table line %d does not match %s\noutput:\n%s", i, pattern, out)
			}
		}
	})

	t.Run("--json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "list", "pages", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := roundTripJSON(t, pagesListFixture()); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("status and locale filters arrive as query params", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		runCLI(t, credsPath, "content", "list", "pages",
			"--status", "published", "--locale", "en", "--api-url", srv.URL)

		if got := fake.lastQuery.Get("status"); got != "published" {
			t.Errorf("status query param = %q, want %q", got, "published")
		}
		if got := fake.lastQuery.Get("locale"); got != "en" {
			t.Errorf("locale query param = %q, want %q", got, "en")
		}
	})

	t.Run("stored token sent as Bearer header", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)
		seedEntry(t, credsPath, srv.URL, creds.Entry{AccessToken: "jwt-stored"})

		runCLI(t, credsPath, "content", "list", "pages", "--api-url", srv.URL)

		if want := "Bearer jwt-stored"; fake.lastAuth != want {
			t.Errorf("list Authorization = %q, want %q", fake.lastAuth, want)
		}
	})
}

func TestContentGet(t *testing.T) {
	t.Run("renders frontmatter block and body as a markdown document", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "get", "pages", "about", "--api-url", srv.URL)

		if fake.getCalls != 1 {
			t.Errorf("get calls = %d, want 1", fake.getCalls)
		}
		want := `---
description: Who we are
featured: true
status: published
title: About Us
---

# About

Who we are.
`
		if out != want {
			t.Errorf("markdown document output\ngot:\n%s\nwant:\n%s", out, want)
		}
	})

	t.Run("--json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "get", "pages", "about", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := roundTripJSON(t, pageAboutFixture()); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("404 surfaces the API error message and a non-zero exit", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out, err := execCLI(t, credsPath, "content", "get", "pages", "missing", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for missing document, got success\noutput:\n%s", out)
		}
		want := `Content "missing" not found in "pages"`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})
}

func TestContentSearch(t *testing.T) {
	t.Run("hits render as a table with collection slug title status locale", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		// "description" is a field name in both fixture documents —
		// search-content.ts matches against JSON.stringify(item.fields),
		// field names included, so both documents are hits.
		out := runCLI(t, credsPath, "content", "search", "description", "--api-url", srv.URL)

		if fake.searchCalls != 1 {
			t.Errorf("search calls = %d, want 1", fake.searchCalls)
		}
		for i, pattern := range []string{
			`^COLLECTION {2,}SLUG {2,}TITLE {2,}STATUS {2,}LOCALE$`,
			`^pages {2,}about {2,}About Us {2,}published {2,}en$`,
			`^pages {2,}contact {2,}Contact {2,}draft {2,}no$`,
		} {
			if !regexp.MustCompile(`(?m)` + pattern).MatchString(out) {
				t.Errorf("table line %d does not match %s\noutput:\n%s", i, pattern, out)
			}
		}
	})

	t.Run("multi-word query and locale arrive URL-encoded as query params", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "search", "who we are",
			"--locale", "en", "--api-url", srv.URL)

		if want := "locale=en&q=who+we+are"; fake.lastSearchRawQuery != want {
			t.Errorf("wire query string = %q, want %q", fake.lastSearchRawQuery, want)
		}
		if got := fake.lastSearchQuery.Get("q"); got != "who we are" {
			t.Errorf("q query param = %q, want %q", got, "who we are")
		}
		if got := fake.lastSearchQuery.Get("locale"); got != "en" {
			t.Errorf("locale query param = %q, want %q", got, "en")
		}
		if !strings.Contains(out, "about") || strings.Contains(out, "contact") {
			t.Errorf("expected only the matching en document as a hit\noutput:\n%s", out)
		}
	})

	t.Run("--json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "search", "who we are",
			"--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"items":   []any{searchHitOf(pageAboutFixture())},
			"hasMore": false,
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("no hits prints a friendly line instead of a bare header", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "search", "matches nothing at all", "--api-url", srv.URL)

		if fake.searchCalls != 1 {
			t.Errorf("search calls = %d, want 1", fake.searchCalls)
		}
		if want := "No documents match \"matches nothing at all\"\n"; out != want {
			t.Errorf("empty-result output = %q, want %q", out, want)
		}
	})

	t.Run("short query surfaces the handler's 400 and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLI(t, credsPath, "content", "search", "x", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for a one-character query, got success\noutput:\n%s", out)
		}
		if fake.searchCalls != 1 {
			t.Errorf("search calls = %d, want 1 (the server owns query validation)", fake.searchCalls)
		}
		want := "Search query must be at least 2 characters"
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
	})
}

// searchHitOf is a search item: the document's meta and fields and a snippet,
// without the body, HTML or sections.
func searchHitOf(doc map[string]any) map[string]any {
	return map[string]any{"meta": doc["meta"], "fields": doc["fields"], "snippet": ""}
}

// roundTripJSON normalizes a fixture through encoding/json so it compares
// with decoded CLI output (numbers as float64, etc.).
func roundTripJSON(t *testing.T, v any) map[string]any {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}
	return out
}

// TestContentListJSONPreservesUnknownFields proves the --json path is raw
// passthrough: a field the CLI's typed structs don't know about must
// survive to the output byte-for-byte.
func TestContentListJSONPreservesUnknownFields(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/content/pages", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items":[],"hasMore":false,"futureField":{"kept":true}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	credsPath := filepath.Join(t.TempDir(), "credentials.json")
	out := runCLI(t, credsPath, "--api-url", srv.URL, "--json", "content", "list", "pages")

	var decoded map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("--json output is not JSON: %v\n%s", err, out)
	}
	if _, ok := decoded["futureField"]; !ok {
		t.Fatalf("--json dropped a field the server returned:\n%s", out)
	}
}
