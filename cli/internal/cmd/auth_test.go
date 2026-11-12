package cmd

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/descoped/krantho/cli/internal/creds"
)

// fakeTokenServer is a token-mode krantho API. Response shapes mirror
// packages/api/src/handlers: auth-capabilities.ts, auth-login.ts,
// auth-me.ts, auth-refresh.ts.
type fakeTokenServer struct {
	secret  string
	jwt     string // access token /api/auth/me currently accepts
	refresh string // refresh token /api/auth/refresh currently accepts

	// nextJWT/nextRefresh are the pair a successful refresh rotates to,
	// mirroring auth-refresh.ts atomic rotation (old pair dies).
	nextJWT     string
	nextRefresh string

	loginCalls   int
	meCalls      int
	refreshCalls int
	lastMeAuth   string // Authorization header seen on the last /api/auth/me
}

// combinedSetCookie is the exact wire format the real server emits: ONE
// comma-joined Set-Cookie value (auth-tokens.ts issueTokenPair builds
// "<accessCookie>, <refreshCookie>"), each cookie carrying the attributes
// from cookies.ts buildCookie with access TTL 900 and refresh TTL 2592000.
func combinedSetCookie(access, refresh string) string {
	return "krantho_access=" + access + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=900" +
		", krantho_refresh=" + refresh + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000"
}

func (f *fakeTokenServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/capabilities", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"auth_mode":      "token",
			"login_required": true,
			"capabilities": map[string]any{
				"password_management": false,
				"role_management":     true,
				"self_registration":   false,
				"user_management":     true,
				"oidc_providers":      []any{},
			},
		})
	})
	mux.HandleFunc("POST /api/auth/login", f.handleLogin)
	mux.HandleFunc("GET /api/auth/me", f.handleMe)
	mux.HandleFunc("POST /api/auth/refresh", f.handleRefresh)
	return mux
}

func (f *fakeTokenServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	f.loginCalls++
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Token is required"})
		return
	}
	if body.Token != f.secret {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Invalid token"})
		return
	}
	w.Header().Set("Set-Cookie", combinedSetCookie(f.jwt, f.refresh))
	writeJSON(w, http.StatusOK, map[string]any{
		"identity": "admin@local",
		"mode":     "token",
		"roles":    []string{"admin"},
		"name":     "Token Admin",
	})
}

func (f *fakeTokenServer) handleRefresh(w http.ResponseWriter, r *http.Request) {
	f.refreshCalls++
	// auth-refresh.ts reads the token via parseCookie(cookie, 'krantho_refresh').
	cookie, err := r.Cookie("krantho_refresh")
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "No refresh token"})
		return
	}
	if cookie.Value != f.refresh {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Invalid refresh token"})
		return
	}
	// Atomic rotation as in auth-refresh.ts: the presented pair dies, the
	// next pair becomes the only valid one, delivered in the combined header.
	f.jwt, f.refresh = f.nextJWT, f.nextRefresh
	w.Header().Set("Set-Cookie", combinedSetCookie(f.jwt, f.refresh))
	// The refresh body carries identity/roles/name — no mode (auth-refresh.ts).
	writeJSON(w, http.StatusOK, map[string]any{
		"identity": "admin@local",
		"roles":    []string{"admin"},
		"name":     "Token Admin",
	})
}

func (f *fakeTokenServer) handleMe(w http.ResponseWriter, r *http.Request) {
	f.meCalls++
	f.lastMeAuth = r.Header.Get("Authorization")
	if f.lastMeAuth != "Bearer "+f.jwt {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Not authenticated"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"identity": "admin@local",
		"mode":     "token",
		"roles":    []string{"admin"},
		"name":     "Token Admin",
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// execCLI runs the root command with a test-scoped credentials path and
// returns the combined output plus the execution error.
func execCLI(t *testing.T, credsPath string, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd(credsPath)
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), err
}

// runCLI is execCLI for commands that must succeed.
func runCLI(t *testing.T, credsPath string, args ...string) string {
	t.Helper()
	out, err := execCLI(t, credsPath, args...)
	if err != nil {
		t.Fatalf("krantho %s: %v\noutput:\n%s", strings.Join(args, " "), err, out)
	}
	return out
}

// loadEntry reloads the credentials file and returns the entry for origin.
func loadEntry(t *testing.T, credsPath, origin string) (creds.Entry, bool) {
	t.Helper()
	store := creds.NewStore(credsPath)
	if err := store.Load(); err != nil {
		t.Fatalf("load credentials %s: %v", credsPath, err)
	}
	return store.Get(origin)
}

// seedEntry writes a credentials entry for origin directly, bypassing login.
func seedEntry(t *testing.T, credsPath, origin string, entry creds.Entry) {
	t.Helper()
	store := creds.NewStore(credsPath)
	store.Set(origin, entry)
	if err := store.Save(); err != nil {
		t.Fatalf("seed credentials: %v", err)
	}
}

// TestAuthLoginStoresCookieJwt proves login extracts BOTH tokens from the
// real wire format — the ONE comma-joined Set-Cookie value the fixture emits
// (combinedSetCookie) — and stores them keyed by the API origin.
func TestAuthLoginStoresCookieJwt(t *testing.T) {
	fake := &fakeTokenServer{secret: "secret", jwt: "jwt-abc.def.ghi", refresh: "refresh-opaque-1"}
	srv := httptest.NewServer(fake.handler())
	defer srv.Close()
	credsPath := filepath.Join(t.TempDir(), "credentials.json")

	out := runCLI(t, credsPath, "auth", "login", "--token", "secret", "--api-url", srv.URL)

	if fake.loginCalls != 1 {
		t.Errorf("login calls = %d, want 1", fake.loginCalls)
	}
	if !strings.Contains(out, "admin@local") || !strings.Contains(out, "token") {
		t.Errorf("login output missing identity + mode:\n%s", out)
	}
	entry, ok := loadEntry(t, credsPath, srv.URL)
	if !ok {
		t.Fatalf("no credentials entry stored for origin %s", srv.URL)
	}
	if entry.AccessToken != fake.jwt {
		t.Errorf("stored access token = %q, want Set-Cookie JWT %q", entry.AccessToken, fake.jwt)
	}
	if entry.RefreshToken != fake.refresh {
		t.Errorf("stored refresh token = %q, want %q", entry.RefreshToken, fake.refresh)
	}
}

// TestAuthLoginSplitSetCookieHeaders is the tolerance case: the real server
// emits ONE combined Set-Cookie value (covered by TestAuthLoginStoresCookieJwt
// via the shared fixture), but some proxies split it into two separate
// Set-Cookie headers — extraction must accept that delivery too.
func TestAuthLoginSplitSetCookieHeaders(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/capabilities", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"auth_mode": "token", "login_required": true})
	})
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Add("Set-Cookie",
			"krantho_access=jwt-split; HttpOnly; SameSite=Lax; Path=/; Max-Age=900")
		w.Header().Add("Set-Cookie",
			"krantho_refresh=refresh-split; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000")
		writeJSON(w, http.StatusOK, map[string]any{
			"identity": "admin@local",
			"mode":     "token",
			"roles":    []string{"admin"},
			"name":     "Token Admin",
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	credsPath := filepath.Join(t.TempDir(), "credentials.json")

	runCLI(t, credsPath, "auth", "login", "--token", "secret", "--api-url", srv.URL)

	entry, ok := loadEntry(t, credsPath, srv.URL)
	if !ok {
		t.Fatalf("no credentials entry stored for origin %s", srv.URL)
	}
	if entry.AccessToken != "jwt-split" {
		t.Errorf("stored access token = %q, want %q", entry.AccessToken, "jwt-split")
	}
	if entry.RefreshToken != "refresh-split" {
		t.Errorf("stored refresh token = %q, want %q", entry.RefreshToken, "refresh-split")
	}
}

func TestAuthLoginTokenModeRequiresToken(t *testing.T) {
	fake := &fakeTokenServer{secret: "secret", jwt: "jwt", refresh: "refresh"}
	srv := httptest.NewServer(fake.handler())
	defer srv.Close()
	credsPath := filepath.Join(t.TempDir(), "credentials.json")

	out, err := execCLI(t, credsPath, "auth", "login", "--api-url", srv.URL)
	if err == nil {
		t.Fatalf("login without --token succeeded, want error\noutput:\n%s", out)
	}
	if !strings.Contains(err.Error(), "--token") {
		t.Errorf("error %q does not tell the user to pass --token", err)
	}
	if fake.loginCalls != 0 {
		t.Errorf("login endpoint called %d times without a token, want 0", fake.loginCalls)
	}
}

func TestAuthStatusReportsIdentity(t *testing.T) {
	fake := &fakeTokenServer{secret: "secret", jwt: "jwt-abc.def.ghi", refresh: "refresh-opaque-1"}
	srv := httptest.NewServer(fake.handler())
	defer srv.Close()
	credsPath := filepath.Join(t.TempDir(), "credentials.json")
	runCLI(t, credsPath, "auth", "login", "--token", "secret", "--api-url", srv.URL)

	out := runCLI(t, credsPath, "auth", "status", "--api-url", srv.URL)

	if fake.meCalls != 1 {
		t.Errorf("/api/auth/me calls = %d, want 1", fake.meCalls)
	}
	if fake.refreshCalls != 0 {
		t.Errorf("refresh calls = %d, want 0 for a valid access token", fake.refreshCalls)
	}
	if want := "Bearer " + fake.jwt; fake.lastMeAuth != want {
		t.Errorf("/api/auth/me Authorization = %q, want %q", fake.lastMeAuth, want)
	}
	if !strings.Contains(out, "admin@local") || !strings.Contains(out, "admin") {
		t.Errorf("status output missing identity/roles:\n%s", out)
	}
}

func TestAuthStatusAnonymous(t *testing.T) {
	credsPath := filepath.Join(t.TempDir(), "credentials.json")

	out := runCLI(t, credsPath, "auth", "status", "--api-url", "http://127.0.0.1:1")

	if !strings.Contains(out, "not authenticated (anonymous)") {
		t.Errorf("status output = %q, want anonymous message", out)
	}
}

func TestAuthStatusExpiredSession(t *testing.T) {
	t.Run("expired access refreshes and retries", func(t *testing.T) {
		fake := &fakeTokenServer{
			secret: "secret", jwt: "jwt-current", refresh: "refresh-current",
			nextJWT: "jwt-rotated", nextRefresh: "refresh-rotated",
		}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL,
			creds.Entry{AccessToken: "jwt-stale", RefreshToken: "refresh-current"})

		out := runCLI(t, credsPath, "auth", "status", "--api-url", srv.URL)

		if fake.refreshCalls != 1 {
			t.Errorf("refresh calls = %d, want 1", fake.refreshCalls)
		}
		if fake.meCalls != 2 {
			t.Errorf("/api/auth/me calls = %d, want 2 (stale, then retried)", fake.meCalls)
		}
		if want := "Bearer jwt-rotated"; fake.lastMeAuth != want {
			t.Errorf("retried /api/auth/me Authorization = %q, want %q", fake.lastMeAuth, want)
		}
		if !strings.Contains(out, "admin@local") {
			t.Errorf("status output missing identity after refresh:\n%s", out)
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

	t.Run("refresh rejected too", func(t *testing.T) {
		fake := &fakeTokenServer{secret: "secret", jwt: "jwt-current", refresh: "refresh-current"}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL,
			creds.Entry{AccessToken: "jwt-stale", RefreshToken: "refresh-stale"})

		out, err := execCLI(t, credsPath, "auth", "status", "--api-url", srv.URL)
		if err == nil {
			t.Fatalf("status with rejected token + refresh succeeded, want error\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "krantho auth login") {
			t.Errorf("error %q does not point the user at `krantho auth login`", err)
		}
		if fake.refreshCalls != 1 {
			t.Errorf("refresh calls = %d, want 1", fake.refreshCalls)
		}
	})

	t.Run("no refresh token stored", func(t *testing.T) {
		fake := &fakeTokenServer{secret: "secret", jwt: "jwt-current", refresh: "refresh-current"}
		srv := httptest.NewServer(fake.handler())
		defer srv.Close()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		seedEntry(t, credsPath, srv.URL, creds.Entry{AccessToken: "jwt-stale"})

		out, err := execCLI(t, credsPath, "auth", "status", "--api-url", srv.URL)
		if err == nil {
			t.Fatalf("status with rejected token succeeded, want error\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "krantho auth login") {
			t.Errorf("error %q does not point the user at `krantho auth login`", err)
		}
		if fake.refreshCalls != 0 {
			t.Errorf("refresh calls = %d, want 0 with no stored refresh token", fake.refreshCalls)
		}
	})
}

func TestAuthLogoutRemovesEntry(t *testing.T) {
	origin := "http://127.0.0.1:4321"
	credsPath := filepath.Join(t.TempDir(), "credentials.json")
	seedEntry(t, credsPath, origin, creds.Entry{AccessToken: "jwt", RefreshToken: "refresh"})

	runCLI(t, credsPath, "auth", "logout", "--api-url", origin)

	if _, ok := loadEntry(t, credsPath, origin); ok {
		t.Errorf("credentials entry for %s still present after logout", origin)
	}

	// Idempotent: logging out again is not an error.
	runCLI(t, credsPath, "auth", "logout", "--api-url", origin)
}

func TestAuthLoginNoneModeStoresNothing(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/capabilities", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"auth_mode": "none", "login_required": false})
	})
	loginCalls := 0
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, _ *http.Request) {
		loginCalls++
		writeJSON(w, http.StatusOK, map[string]any{"identity": "anonymous", "mode": "none"})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	credsPath := filepath.Join(t.TempDir(), "credentials.json")

	out := runCLI(t, credsPath, "auth", "login", "--api-url", srv.URL)

	if !strings.Contains(out, "no authentication") {
		t.Errorf("none-mode output = %q, want no-authentication message", out)
	}
	if loginCalls != 0 {
		t.Errorf("login endpoint called %d times in none mode, want 0", loginCalls)
	}
	if _, err := os.Stat(credsPath); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("credentials file %s exists after none-mode login (stat err = %v)", credsPath, err)
	}
}

func TestAuthLoginOidcMode(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/capabilities", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"auth_mode":      "oidc",
			"login_required": true,
			"capabilities": map[string]any{
				"oidc_providers": []any{
					map[string]any{"name": "OIDC Provider", "login_url": "/api/auth/login/oidc"},
				},
			},
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	t.Run("without token prints guidance and fails", func(t *testing.T) {
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		out, err := execCLI(t, credsPath, "auth", "login", "--api-url", srv.URL)
		if err == nil {
			t.Fatalf("oidc login without --token succeeded, want error\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "Studio") {
			t.Errorf("error %q does not point at Studio", err)
		}
	})

	t.Run("with token stores it as access token", func(t *testing.T) {
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		runCLI(t, credsPath, "auth", "login", "--token", "jwt-from-admin-ui", "--api-url", srv.URL)
		entry, ok := loadEntry(t, credsPath, srv.URL)
		if !ok {
			t.Fatalf("no credentials entry stored for %s", srv.URL)
		}
		if entry.AccessToken != "jwt-from-admin-ui" {
			t.Errorf("stored access token = %q, want provided JWT", entry.AccessToken)
		}
		if entry.RefreshToken != "" {
			t.Errorf("stored refresh token = %q, want empty", entry.RefreshToken)
		}
	})
}
