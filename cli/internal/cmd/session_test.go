package cmd

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/descoped/krantho/cli/internal/creds"
)

// fakeSessionServer is a token-mode krantho API serving an authenticated
// content endpoint plus the refresh endpoint, for proving the shared
// 401→refresh-once→retry recovery on ordinary command requests. Response
// shapes mirror packages/api/src/handlers: list-collection.ts for the
// content endpoint, auth-refresh.ts for the rotation (combined Set-Cookie
// delivery as in auth-tokens.ts).
type fakeSessionServer struct {
	jwt     string // access token the content endpoint currently accepts
	refresh string // refresh token /api/auth/refresh currently accepts

	// nextJWT/nextRefresh are the pair a successful refresh rotates to,
	// mirroring auth-refresh.ts atomic rotation (old pair dies).
	nextJWT     string
	nextRefresh string

	refreshCalls int
	contentAuths []string // Authorization header per /api/content/pages call
}

func (f *fakeSessionServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/content/pages", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		f.contentAuths = append(f.contentAuths, auth)
		if auth != "Bearer "+f.jwt {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Not authenticated"})
			return
		}
		writeJSON(w, http.StatusOK, pagesListFixture())
	})
	mux.HandleFunc("POST /api/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		f.refreshCalls++
		cookie, err := r.Cookie("krantho_refresh")
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "No refresh token"})
			return
		}
		if cookie.Value != f.refresh {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Invalid refresh token"})
			return
		}
		f.jwt, f.refresh = f.nextJWT, f.nextRefresh
		w.Header().Set("Set-Cookie", combinedSetCookie(f.jwt, f.refresh))
		writeJSON(w, http.StatusOK, map[string]any{
			"identity": "admin@local",
			"roles":    []string{"admin"},
			"name":     "Token Admin",
		})
	})
	return mux
}

// TestClientRefreshRetry proves the shared session recovery on an ordinary
// authenticated command (content list): an expired access token triggers
// exactly one refresh, the rotated pair is persisted, and the failed
// request is retried once with the rotated Bearer.
func TestClientRefreshRetry(t *testing.T) {
	t.Run("expired access refreshes once, persists, and retries", func(t *testing.T) {
		fake := &fakeSessionServer{
			jwt: "jwt-current", refresh: "refresh-current",
			nextJWT: "jwt-rotated", nextRefresh: "refresh-rotated",
		}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL,
			creds.Entry{AccessToken: "jwt-stale", RefreshToken: "refresh-current"})

		out := runCLI(t, credsPath, "content", "list", "pages", "--api-url", srv.URL)

		if fake.refreshCalls != 1 {
			t.Errorf("refresh calls = %d, want 1", fake.refreshCalls)
		}
		want := []string{"Bearer jwt-stale", "Bearer jwt-rotated"}
		if !reflect.DeepEqual(fake.contentAuths, want) {
			t.Errorf("content Authorization sequence = %q, want %q", fake.contentAuths, want)
		}
		if !strings.Contains(out, "about") {
			t.Errorf("recovered list output missing table rows:\n%s", out)
		}
		entry, ok := loadEntry(t, credsPath, srv.URL)
		if !ok {
			t.Fatalf("no credentials entry stored for %s after refresh", srv.URL)
		}
		if entry.AccessToken != "jwt-rotated" || entry.RefreshToken != "refresh-rotated" {
			t.Errorf("stored pair = (%q, %q), want rotated (jwt-rotated, refresh-rotated)",
				entry.AccessToken, entry.RefreshToken)
		}
	})

	t.Run("refresh failure surfaces session-expired guidance", func(t *testing.T) {
		fake := &fakeSessionServer{jwt: "jwt-current", refresh: "refresh-current"}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL,
			creds.Entry{AccessToken: "jwt-stale", RefreshToken: "refresh-stale"})

		out, err := execCLI(t, credsPath, "content", "list", "pages", "--api-url", srv.URL)
		if err == nil {
			t.Fatalf("list with rejected token + refresh succeeded, want error\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "krantho auth login") {
			t.Errorf("error %q does not point the user at `krantho auth login`", err)
		}
		if fake.refreshCalls != 1 {
			t.Errorf("refresh calls = %d, want 1", fake.refreshCalls)
		}
		if len(fake.contentAuths) != 1 {
			t.Errorf("content calls = %d, want 1 (no retry after a failed refresh)",
				len(fake.contentAuths))
		}
	})

	t.Run("no refresh token stored surfaces the original 401", func(t *testing.T) {
		fake := &fakeSessionServer{jwt: "jwt-current", refresh: "refresh-current"}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL, creds.Entry{AccessToken: "jwt-stale"})

		out, err := execCLI(t, credsPath, "content", "list", "pages", "--api-url", srv.URL)
		if err == nil {
			t.Fatalf("list with rejected token succeeded, want error\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "Not authenticated") {
			t.Errorf("error %q does not carry the original API 401 message", err)
		}
		if strings.Contains(err.Error(), "auth login") {
			t.Errorf("error %q rewrote the original 401, want it untouched", err)
		}
		if fake.refreshCalls != 0 {
			t.Errorf("refresh calls = %d, want 0 with no stored refresh token", fake.refreshCalls)
		}
		if len(fake.contentAuths) != 1 {
			t.Errorf("content calls = %d, want 1 (no retry possible)", len(fake.contentAuths))
		}
	})
}
