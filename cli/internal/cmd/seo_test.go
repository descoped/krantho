package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// fakeSeoServer serves the SEO endpoints with the shapes of the real
// handlers: GET /api/seo/status (seo-status.ts), POST /api/seo/generate
// (seo-generate.ts), and the async enrichment pair POST /api/seo/enrich +
// GET /api/seo/enrich/status (seo-enrich.ts + seo-enrich-runner.ts). The
// enrich status walks pollStates one poll at a time, repeating the last.
type fakeSeoServer struct {
	statusCalls    int
	generateCalls  int
	enrichCalls    int
	lastEnrichBody map[string]any
	noItems        bool
	conflict       bool
	pollCalls      int
	lastPollJobID  string
	pollStates     []string
}

func (f *fakeSeoServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/seo/status", f.seoStatus)
	mux.HandleFunc("POST /api/seo/generate", f.seoGenerate)
	mux.HandleFunc("POST /api/seo/enrich", f.seoEnrich)
	mux.HandleFunc("GET /api/seo/enrich/status", f.seoEnrichStatus)
	return mux
}

func (f *fakeSeoServer) seoStatus(w http.ResponseWriter, _ *http.Request) {
	f.statusCalls++
	writeRawJSON(w, seoStatusJSON)
}

func (f *fakeSeoServer) seoGenerate(w http.ResponseWriter, _ *http.Request) {
	f.generateCalls++
	writeRawJSON(w, seoGenerateJSON)
}

// seoEnrich mirrors seo-enrich.ts: 409 while a job runs, the no-items 200
// with a null jobId, else a 202 that echoes the requested type.
func (f *fakeSeoServer) seoEnrich(w http.ResponseWriter, r *http.Request) {
	f.enrichCalls++
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Request body must be valid JSON"})
		return
	}
	f.lastEnrichBody = body
	if f.conflict {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "An enrichment job is already running", "jobId": "enrich-0",
		})
		return
	}
	if f.noItems {
		writeJSON(w, http.StatusOK, map[string]any{"jobId": nil, "message": "No items to enrich"})
		return
	}
	enrichType, _ := body["type"].(string)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"jobId": "enrich-1", "status": "running", "type": enrichType, "totalItems": 3,
	})
}

func (f *fakeSeoServer) seoEnrichStatus(w http.ResponseWriter, r *http.Request) {
	f.lastPollJobID = r.URL.Query().Get("jobId")
	idx := f.pollCalls
	f.pollCalls++
	if idx >= len(f.pollStates) {
		idx = len(f.pollStates) - 1
	}
	writeRawJSON(w, f.pollStates[idx])
}

func writeRawJSON(w http.ResponseWriter, raw string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(raw))
}

// seoStatusJSON is the seo-status.ts 200 body: one entry per generated SEO
// file, exists=true paired with the file kind's own count key and nothing
// else on a missing file.
const seoStatusJSON = `{
	"structuredData": {"exists": true, "entries": 12},
	"faqPages": {"exists": false},
	"llmsTxt": {"exists": true, "bytes": 2048},
	"sitemap": {"exists": true, "urls": 14},
	"contentDates": {"exists": false}
}`

// seoGenerateJSON is the seo-generate.ts 200 body: sitemap built in-server,
// the CLI-only targets answered with the requires-CLI pointer.
const seoGenerateJSON = `{
	"results": {
		"sitemap": "generated",
		"structured-data": "requires CLI: pnpm run seo:generate",
		"faq-pages": "requires CLI: pnpm run seo:generate",
		"llms-txt": "requires CLI: pnpm run seo:generate"
	}
}`

// The enrich status snapshots below mirror the GET /api/seo/enrich/status
// envelope (seo-enrich.ts): jobId, status (running | complete | error per
// seo-enrich-runner.ts), type, computed progress, the items array, and the
// summary — absent until the runner finishes, like the handler's undefined.

const enrichRunning1 = `{
	"jobId": "enrich-1",
	"status": "running",
	"type": "meta-descriptions",
	"progress": {"total": 3, "completed": 0, "skipped": 0, "errors": 0, "current": "pages/about"},
	"items": [
		{"collection": "pages", "slug": "about", "status": "generating"},
		{"collection": "pages", "slug": "team", "status": "pending"},
		{"collection": "services", "slug": "consulting", "status": "pending"}
	]
}`

const enrichRunning2 = `{
	"jobId": "enrich-1",
	"status": "running",
	"type": "meta-descriptions",
	"progress": {"total": 3, "completed": 1, "skipped": 1, "errors": 0, "current": "services/consulting"},
	"items": [
		{"collection": "pages", "slug": "about", "status": "complete", "result": "Generated meta description"},
		{"collection": "pages", "slug": "team", "status": "skipped", "result": "Already has meta-description"},
		{"collection": "services", "slug": "consulting", "status": "generating"}
	]
}`

const enrichComplete = `{
	"jobId": "enrich-1",
	"status": "complete",
	"type": "meta-descriptions",
	"progress": {"total": 3, "completed": 2, "skipped": 1, "errors": 0, "current": null},
	"items": [
		{"collection": "pages", "slug": "about", "status": "complete", "result": "Generated meta description"},
		{"collection": "pages", "slug": "team", "status": "skipped", "result": "Already has meta-description"},
		{"collection": "services", "slug": "consulting", "status": "complete", "result": "Generated meta description"}
	],
	"summary": {"generated": 2, "skipped": 1, "errors": 0}
}`

const enrichCompleteWithErrors = `{
	"jobId": "enrich-1",
	"status": "complete",
	"type": "meta-descriptions",
	"progress": {"total": 3, "completed": 1, "skipped": 1, "errors": 1, "current": null},
	"items": [
		{"collection": "pages", "slug": "about", "status": "complete", "result": "Generated meta description"},
		{"collection": "pages", "slug": "team", "status": "skipped", "result": "Already has meta-description"},
		{"collection": "services", "slug": "consulting", "status": "error", "error": "LLM request failed: 429"}
	],
	"summary": {"generated": 1, "skipped": 1, "errors": 1}
}`

const enrichErrorState = `{
	"jobId": "enrich-1",
	"status": "error",
	"type": "meta-descriptions",
	"progress": {"total": 3, "completed": 0, "skipped": 0, "errors": 0, "current": null},
	"items": [
		{"collection": "pages", "slug": "about", "status": "pending"},
		{"collection": "pages", "slug": "team", "status": "pending"},
		{"collection": "services", "slug": "consulting", "status": "pending"}
	]
}`

// startSeoServer starts a fresh fake SEO API and returns it with a
// test-scoped credentials path.
func startSeoServer(t *testing.T) (*fakeSeoServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeSeoServer{}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

// shortenEnrichPolling makes the enrich watch loop test-speed: a
// millisecond interval and the given poll cap, restored on cleanup.
func shortenEnrichPolling(t *testing.T, limit int) {
	t.Helper()
	oldInterval, oldLimit := enrichPollInterval, enrichPollLimit
	enrichPollInterval = time.Millisecond
	enrichPollLimit = limit
	t.Cleanup(func() {
		enrichPollInterval = oldInterval
		enrichPollLimit = oldLimit
	})
}

// lineContaining asserts that one output line carries all tokens in order.
func lineContaining(t *testing.T, out string, tokens ...string) {
	t.Helper()
	for _, line := range strings.Split(out, "\n") {
		rest := line
		matched := true
		for _, token := range tokens {
			_, after, ok := strings.Cut(rest, token)
			if !ok {
				matched = false
				break
			}
			rest = after
		}
		if matched {
			return
		}
	}
	t.Errorf("no output line contains %q in order\noutput:\n%s", tokens, out)
}

func TestSeoCommands(t *testing.T) {
	t.Run("status renders one row per SEO file", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)

		out := runCLI(t, credsPath, "seo", "status", "--api-url", srv.URL)

		if fake.statusCalls != 1 {
			t.Errorf("status calls = %d, want 1", fake.statusCalls)
		}
		lineContaining(t, out, "FILE", "STATUS", "DETAIL")
		lineContaining(t, out, "structured-data.json", "present", "12 entries")
		lineContaining(t, out, "faq-pages.json", "missing", "-")
		lineContaining(t, out, "llms.txt", "present", "2048 bytes")
		lineContaining(t, out, "sitemap.xml", "present", "14 urls")
		lineContaining(t, out, "content-dates.json", "missing", "-")
	})

	t.Run("status --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSeoServer(t)

		out := runCLI(t, credsPath, "seo", "status", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := decodeFixture(t, seoStatusJSON); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("generate posts and prints per-target results", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)

		out := runCLI(t, credsPath, "seo", "generate", "--api-url", srv.URL)

		if fake.generateCalls != 1 {
			t.Errorf("generate calls = %d, want 1", fake.generateCalls)
		}
		lineContaining(t, out, "TARGET", "RESULT")
		lineContaining(t, out, "sitemap", "generated")
		lineContaining(t, out, "structured-data", "requires CLI: pnpm run seo:generate")
		lineContaining(t, out, "faq-pages", "requires CLI: pnpm run seo:generate")
		lineContaining(t, out, "llms-txt", "requires CLI: pnpm run seo:generate")
	})

	t.Run("generate --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSeoServer(t)

		out := runCLI(t, credsPath, "seo", "generate", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := decodeFixture(t, seoGenerateJSON); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("enrich polls the job to completion with progress lines", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichRunning1, enrichRunning2, enrichComplete}
		shortenEnrichPolling(t, 10)

		out := runCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if fake.enrichCalls != 1 {
			t.Errorf("enrich calls = %d, want 1", fake.enrichCalls)
		}
		if want := roundTripJSON(t, map[string]any{"type": "meta-descriptions"}); !reflect.DeepEqual(fake.lastEnrichBody, want) {
			t.Errorf("enrich request body\ngot:  %#v\nwant: %#v", fake.lastEnrichBody, want)
		}
		if fake.pollCalls != 3 {
			t.Errorf("status polls = %d, want 3 (poll until the terminal state, then stop)", fake.pollCalls)
		}
		if fake.lastPollJobID != "enrich-1" {
			t.Errorf("poll jobId = %q, want %q", fake.lastPollJobID, "enrich-1")
		}
		for _, want := range []string{
			"Started enrichment job enrich-1 (meta-descriptions, 3 items)\n",
			"  0/3 done (0 skipped, 0 errors) — generating pages/about\n",
			"  2/3 done (1 skipped, 0 errors) — generating services/consulting\n",
			"  3/3 done (1 skipped, 0 errors)\n",
			"Enrichment complete: 2 generated, 1 skipped, 0 errors\n",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("output missing %q\noutput:\n%s", want, out)
			}
		}
	})

	t.Run("errored items are listed and exit non-zero", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichRunning1, enrichCompleteWithErrors}
		shortenEnrichPolling(t, 10)

		out, err := execCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for errored items, got success\noutput:\n%s", out)
		}
		if want := "1 of 3 items failed to enrich"; err.Error() != want {
			t.Errorf("error = %q, want %q", err.Error(), want)
		}
		for _, want := range []string{
			"Enrichment complete: 1 generated, 1 skipped, 1 errors\n",
			"  failed services/consulting: LLM request failed: 429\n",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("output missing %q\noutput:\n%s", want, out)
			}
		}
	})

	t.Run("an error job state exits non-zero", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichErrorState}
		shortenEnrichPolling(t, 10)

		out, err := execCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for the error job state, got success\noutput:\n%s", out)
		}
		if want := "enrichment job enrich-1 ended in error"; err.Error() != want {
			t.Errorf("error = %q, want %q", err.Error(), want)
		}
		if want := "Enrichment failed: 0 generated, 0 skipped, 0 errors\n"; !strings.Contains(out, want) {
			t.Errorf("output missing %q\noutput:\n%s", want, out)
		}
	})

	t.Run("nothing to enrich prints the message without polling", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.noItems = true

		out := runCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if out != "No items to enrich\n" {
			t.Errorf("output = %q, want %q", out, "No items to enrich\n")
		}
		if fake.pollCalls != 0 {
			t.Errorf("status polls = %d, want 0 (no job to watch)", fake.pollCalls)
		}
	})

	t.Run("--json watches silently and emits the final raw status", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichRunning1, enrichComplete}
		shortenEnrichPolling(t, 10)

		out := runCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--json", "--api-url", srv.URL)

		// The whole stdout must be one JSON document — a progress line
		// would break the decode.
		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := decodeFixture(t, enrichComplete); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from the final poll\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("--json still exits non-zero on errored items", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichCompleteWithErrors}
		shortenEnrichPolling(t, 10)

		out, err := execCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--json", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for errored items, got success\noutput:\n%s", out)
		}
		if want := "1 of 3 items failed to enrich"; err.Error() != want {
			t.Errorf("error = %q, want %q", err.Error(), want)
		}
	})

	t.Run("the watch gives up after the poll cap", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.pollStates = []string{enrichRunning1}
		shortenEnrichPolling(t, 3)

		out, err := execCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error after the poll cap, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "the job keeps running server-side") {
			t.Errorf("error = %q, want it to say the job keeps running", err.Error())
		}
		if fake.pollCalls != 3 {
			t.Errorf("status polls = %d, want the cap of 3", fake.pollCalls)
		}
	})

	t.Run("a running job conflict surfaces the 409 without polling", func(t *testing.T) {
		fake, srv, credsPath := startSeoServer(t)
		fake.conflict = true

		out, err := execCLI(t, credsPath, "seo", "enrich", "meta-descriptions", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for the running-job conflict, got success\noutput:\n%s", out)
		}
		if want := "An enrichment job is already running"; !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if fake.pollCalls != 0 {
			t.Errorf("status polls = %d, want 0", fake.pollCalls)
		}
	})
}
