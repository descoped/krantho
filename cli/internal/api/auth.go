package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

const (
	// accessCookieName is the Set-Cookie name carrying the JWT after login.
	accessCookieName = "krantho_access"
	// refreshCookieName is the Set-Cookie name carrying the refresh token;
	// the refresh endpoint reads it back from the request Cookie header.
	refreshCookieName = "krantho_refresh"
)

// AuthCapabilities is what the CLI needs from GET /api/auth/capabilities;
// extra fields in the response are ignored.
type AuthCapabilities struct {
	// Mode is "none", "token", or "oidc".
	Mode string
}

// Capabilities probes the public GET /api/auth/capabilities endpoint. The
// live handler (auth-capabilities.ts) reports the mode as "auth_mode".
func (c *Client) Capabilities() (*AuthCapabilities, error) {
	var payload struct {
		AuthMode string `json:"auth_mode"`
	}
	if err := c.Get("/api/auth/capabilities", &payload); err != nil {
		return nil, err
	}
	if payload.AuthMode == "" {
		return nil, errors.New("server reported no auth mode")
	}
	return &AuthCapabilities{Mode: payload.AuthMode}, nil
}

// Identity is the caller identity as reported by the login and
// GET /api/auth/me response bodies (auth-login.ts / auth-me.ts).
type Identity struct {
	Identity string   `json:"identity"`
	Mode     string   `json:"mode"`
	Roles    []string `json:"roles"`
	Name     string   `json:"name"`
}

// Me returns the identity behind the client's token via GET /api/auth/me.
func (c *Client) Me() (*Identity, error) {
	var identity Identity
	if err := c.Get("/api/auth/me", &identity); err != nil {
		return nil, err
	}
	return &identity, nil
}

// AuthResult is a successful token-issuing auth response (POST
// /api/auth/login or /api/auth/refresh): the decoded JSON body plus the
// token pair the server delivers only in Set-Cookie headers.
type AuthResult struct {
	Identity Identity
	// AccessToken is the JWT from the krantho_access cookie; empty when the
	// server set no access cookie (e.g. auth mode none).
	AccessToken string
	// RefreshToken is the krantho_refresh cookie value; empty when none
	// was set.
	RefreshToken string
}

// Login exchanges the shared secret for a token pair via POST
// /api/auth/login with body {"token": "<secret>"}. The JWT arrives only in
// Set-Cookie headers (auth-login.ts), never in the JSON body.
func (c *Client) Login(sharedSecret string) (*AuthResult, error) {
	data, err := json.Marshal(map[string]string{"token": sharedSecret})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/api/auth/login", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.doAuthRequest(req)
}

// Refresh rotates the token pair via POST /api/auth/refresh. The handler
// (auth-refresh.ts) reads the refresh token only from the krantho_refresh
// request cookie — not a Bearer header, not the body — and on success
// responds like login: identity JSON plus the rotated pair in Set-Cookie.
func (c *Client) Refresh(refreshToken string) (*AuthResult, error) {
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/api/auth/refresh", nil)
	if err != nil {
		return nil, err
	}
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: refreshToken})
	return c.doAuthRequest(req)
}

// doAuthRequest sends a token-issuing auth request and decodes the result:
// identity from the JSON body, token pair from the raw Set-Cookie headers.
func (c *Client) doAuthRequest(req *http.Request) (*AuthResult, error) {
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, newAPIError(resp)
	}
	result := &AuthResult{}
	if err := json.NewDecoder(resp.Body).Decode(&result.Identity); err != nil {
		return nil, err
	}
	result.AccessToken, result.RefreshToken = tokenPairFromSetCookie(resp.Header.Values("Set-Cookie"))
	return result, nil
}

// tokenPairFromSetCookie extracts the krantho_access / krantho_refresh
// values from raw Set-Cookie header values. The real server delivers both
// cookies as ONE comma-joined header value (auth-tokens.ts issueTokenPair
// builds "<accessCookie>, <refreshCookie>" and the handler header map is
// single-valued); Go's http.Response.Cookies() silently drops the refresh
// cookie from that combined line, so the raw values are scanned instead.
// Token values carry no `;` or `,`, which makes splitting on both
// delimiters safe — a cookie value ends at `;`, `,`, or end-of-string —
// and also accepts the split two-header delivery some proxies produce.
func tokenPairFromSetCookie(setCookieValues []string) (access, refresh string) {
	isDelimiter := func(r rune) bool { return r == ';' || r == ',' }
	for _, headerValue := range setCookieValues {
		for _, fragment := range strings.FieldsFunc(headerValue, isDelimiter) {
			fragment = strings.TrimSpace(fragment)
			if value, ok := strings.CutPrefix(fragment, accessCookieName+"="); ok {
				access = value
			} else if value, ok := strings.CutPrefix(fragment, refreshCookieName+"="); ok {
				refresh = value
			}
		}
	}
	return access, refresh
}
