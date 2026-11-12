package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientAuthHeader(t *testing.T) {
	tests := []struct {
		name            string
		token           string
		call            func(c *Client) error
		wantAuth        string
		wantContentType string
	}{
		{
			name:     "GET with token sends Bearer",
			token:    "jwt-abc",
			call:     func(c *Client) error { return c.Get("/api/collections", nil) },
			wantAuth: "Bearer jwt-abc",
		},
		{
			name: "GET without token omits Authorization",
			call: func(c *Client) error { return c.Get("/api/collections", nil) },
		},
		{
			name:  "POST with body sets Content-Type",
			token: "jwt-abc",
			call: func(c *Client) error {
				return c.Post("/api/content/pages", map[string]string{"slug": "home"}, nil)
			},
			wantAuth:        "Bearer jwt-abc",
			wantContentType: "application/json",
		},
		{
			name: "PUT with body and no token",
			call: func(c *Client) error {
				return c.Put("/api/content/pages/home", map[string]string{"title": "Home"}, nil)
			},
			wantContentType: "application/json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got http.Header
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got = r.Header.Clone()
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, "{}")
			}))
			defer srv.Close()

			if err := tt.call(New(srv.URL, tt.token, nil)); err != nil {
				t.Fatalf("request failed: %v", err)
			}
			if auth := got.Get("Authorization"); auth != tt.wantAuth {
				t.Errorf("Authorization = %q, want %q", auth, tt.wantAuth)
			}
			if accept := got.Get("Accept"); accept != "application/json" {
				t.Errorf("Accept = %q, want %q", accept, "application/json")
			}
			if ct := got.Get("Content-Type"); ct != tt.wantContentType {
				t.Errorf("Content-Type = %q, want %q", ct, tt.wantContentType)
			}
		})
	}
}

func TestClientErrorMapping(t *testing.T) {
	errorCases := []struct {
		name       string
		status     int
		body       string
		call       func(c *Client) error
		wantStatus int
		wantMsg    string
	}{
		{
			name:       "404 with krantho error body",
			status:     http.StatusNotFound,
			body:       `{"error": "Content \"home\" not found in \"pages\""}`,
			call:       func(c *Client) error { return c.Get("/api/content/pages/home", nil) },
			wantStatus: http.StatusNotFound,
			wantMsg:    `Content "home" not found in "pages"`,
		},
		{
			name:       "500 with non-JSON body falls back to status text",
			status:     http.StatusInternalServerError,
			body:       "boom",
			call:       func(c *Client) error { return c.Delete("/api/content/pages/home", nil) },
			wantStatus: http.StatusInternalServerError,
			wantMsg:    "Internal Server Error",
		},
		{
			name:   "401 with error body on POST",
			status: http.StatusUnauthorized,
			body:   `{"error": "Invalid token"}`,
			call: func(c *Client) error {
				return c.Post("/api/auth/login", map[string]string{"token": "nope"}, nil)
			},
			wantStatus: http.StatusUnauthorized,
			wantMsg:    "Invalid token",
		},
	}

	for _, tt := range errorCases {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				fmt.Fprint(w, tt.body)
			}))
			defer srv.Close()

			err := tt.call(New(srv.URL, "", nil))
			var apiErr *APIError
			if !errors.As(err, &apiErr) {
				t.Fatalf("error = %v (%T), want *APIError", err, err)
			}
			if apiErr.Status != tt.wantStatus {
				t.Errorf("Status = %d, want %d", apiErr.Status, tt.wantStatus)
			}
			if apiErr.Message != tt.wantMsg {
				t.Errorf("Message = %q, want %q", apiErr.Message, tt.wantMsg)
			}
		})
	}

	t.Run("2xx decodes into target", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPut {
				t.Errorf("method = %q, want %q", r.Method, http.MethodPut)
			}
			if r.URL.Path != "/api/content/pages/home" {
				t.Errorf("path = %q, want %q", r.URL.Path, "/api/content/pages/home")
			}
			var sent struct {
				Fields map[string]any `json:"fields"`
			}
			if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
				t.Errorf("request body is not JSON: %v", err)
			} else if sent.Fields["title"] != "Home" {
				t.Errorf("sent fields.title = %v, want %q", sent.Fields["title"], "Home")
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"fields": {"title": "Home", "status": "published"}, "body": "# Home"}`)
		}))
		defer srv.Close()

		var out struct {
			Fields map[string]any `json:"fields"`
			Body   string         `json:"body"`
		}
		c := New(srv.URL, "", srv.Client())
		body := map[string]any{"fields": map[string]any{"title": "Home"}}
		if err := c.Put("/api/content/pages/home", body, &out); err != nil {
			t.Fatalf("Put failed: %v", err)
		}
		if out.Fields["title"] != "Home" {
			t.Errorf("fields.title = %v, want %q", out.Fields["title"], "Home")
		}
		if out.Fields["status"] != "published" {
			t.Errorf("fields.status = %v, want %q", out.Fields["status"], "published")
		}
		if out.Body != "# Home" {
			t.Errorf("body = %q, want %q", out.Body, "# Home")
		}
	})
}
