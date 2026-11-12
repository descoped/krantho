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

	"github.com/descoped/krantho/cli/internal/creds"
)

// fakeInfoServer serves GET /api/site-config with the response shape of
// packages/api/src/handlers/site-config.ts ({ site, collections } where the
// collections items carry name/source/fieldCount) and GET /api/collections
// with the shape of list-collections.ts ({ collections } items carrying
// name/source/directory — directory is undefined for database-sourced
// collections, so JSON serialization omits the key).
type fakeInfoServer struct {
	siteConfigCalls  int
	collectionsCalls int
	lastAuth         string // Authorization header seen on the last request
}

func (f *fakeInfoServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/site-config", func(w http.ResponseWriter, r *http.Request) {
		f.siteConfigCalls++
		f.lastAuth = r.Header.Get("Authorization")
		writeJSON(w, http.StatusOK, siteConfigFixture())
	})
	mux.HandleFunc("GET /api/collections", func(w http.ResponseWriter, r *http.Request) {
		f.collectionsCalls++
		f.lastAuth = r.Header.Get("Authorization")
		writeJSON(w, http.StatusOK, collectionsFixture())
	})
	return mux
}

// siteConfigFixture is the site-config.ts response body: identity values
// from SiteConfig plus per-collection schema field counts.
func siteConfigFixture() map[string]any {
	return map[string]any{
		"site": map[string]any{
			"domain":           "example.com",
			"name":             "Example Site",
			"language":         "en",
			"baseUrl":          "https://example.com",
			"supportedLocales": []any{"en", "no"},
			"defaultLocale":    "en",
		},
		"collections": []any{
			map[string]any{"name": "pages", "source": "filesystem", "fieldCount": 4},
			map[string]any{"name": "services", "source": "filesystem", "fieldCount": 5},
			map[string]any{"name": "globals", "source": "database", "fieldCount": 0},
		},
	}
}

// collectionsFixture is the list-collections.ts response body. The globals
// entry has no directory key — the handler's `directory: undefined` for
// non-filesystem collections disappears in JSON.
func collectionsFixture() map[string]any {
	return map[string]any{
		"collections": []any{
			map[string]any{"name": "pages", "source": "filesystem", "directory": "content/pages"},
			map[string]any{"name": "services", "source": "filesystem", "directory": "content/services"},
			map[string]any{"name": "globals", "source": "database"},
		},
	}
}

// startInfoServer starts a fresh fake site API and returns it with a
// test-scoped credentials path.
func startInfoServer(t *testing.T) (*fakeInfoServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeInfoServer{}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

func TestInfo(t *testing.T) {
	t.Run("summary shows site identity, origin, anonymous auth state, and collections table", func(t *testing.T) {
		fake, srv, credsPath := startInfoServer(t)

		out := runCLI(t, credsPath, "info", "--api-url", srv.URL)

		if fake.siteConfigCalls != 1 || fake.collectionsCalls != 1 {
			t.Errorf("calls = %d site-config, %d collections, want 1 each",
				fake.siteConfigCalls, fake.collectionsCalls)
		}
		if fake.lastAuth != "" {
			t.Errorf("anonymous info sent Authorization %q, want none", fake.lastAuth)
		}
		for _, want := range []string{
			"Example Site",        // site name
			"example.com",         // site domain
			"https://example.com", // site base URL
			"en, no (default en)", // locales
			"Origin:  " + srv.URL, // resolved API origin
			"Auth:    anonymous",  // no credentials entry stored
		} {
			if !strings.Contains(out, want) {
				t.Errorf("summary missing %q\noutput:\n%s", want, out)
			}
		}
		for i, pattern := range []string{
			`^NAME {2,}SOURCE {2,}DIRECTORY$`,
			`^pages {2,}filesystem {2,}content/pages$`,
			`^services {2,}filesystem {2,}content/services$`,
			`^globals {2,}database *$`,
		} {
			if !regexp.MustCompile(`(?m)` + pattern).MatchString(out) {
				t.Errorf("collections table line %d does not match %s\noutput:\n%s", i, pattern, out)
			}
		}
	})

	t.Run("stored credentials flip the auth state and send the Bearer header", func(t *testing.T) {
		fake, srv, credsPath := startInfoServer(t)
		seedEntry(t, credsPath, srv.URL, creds.Entry{AccessToken: "jwt-stored"})

		out := runCLI(t, credsPath, "info", "--api-url", srv.URL)

		if want := "Auth:    token stored"; !strings.Contains(out, want) {
			t.Errorf("summary missing %q\noutput:\n%s", want, out)
		}
		if want := "Bearer jwt-stored"; fake.lastAuth != want {
			t.Errorf("info Authorization = %q, want %q", fake.lastAuth, want)
		}
	})

	t.Run("--json emits the combined raw responses", func(t *testing.T) {
		_, srv, credsPath := startInfoServer(t)

		out := runCLI(t, credsPath, "info", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"siteConfig":  siteConfigFixture(),
			"collections": collectionsFixture(),
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from combined server responses\ngot:  %#v\nwant: %#v", got, want)
		}
	})
}
