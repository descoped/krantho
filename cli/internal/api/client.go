// Package api is the HTTP client for the krantho REST API.
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// defaultTimeout bounds every request made with the default HTTP client.
const defaultTimeout = 30 * time.Second

// Client talks to a krantho API server. Construct it with New.
type Client struct {
	// baseURL is the API origin (no trailing slash, no /api suffix) —
	// config.ResolveAPIURL already normalizes it.
	baseURL string
	// token is the JWT sent as a Bearer header; empty means anonymous.
	token string
	httpc *http.Client
}

// New returns a Client for the API at baseURL authenticating with token
// (empty = anonymous). httpClient may be nil, in which case a default
// client with a 30-second timeout is used.
func New(baseURL, token string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultTimeout}
	}
	return &Client{baseURL: baseURL, token: token, httpc: httpClient}
}

// APIError is a non-2xx API response. Message carries the server's
// `{"error": "..."}` payload when present, else the HTTP status text.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s (status %d)", e.Message, e.Status)
}

// Get issues a GET for an absolute API path (e.g. /api/collections) and
// decodes a 2xx JSON response into out. A nil out discards the body.
func (c *Client) Get(path string, out any) error {
	return c.do(http.MethodGet, path, nil, out)
}

// Post issues a POST with a JSON-encoded body and decodes a 2xx JSON
// response into out. A nil body sends no payload; a nil out discards it.
func (c *Client) Post(path string, body any, out any) error {
	return c.do(http.MethodPost, path, body, out)
}

// Put issues a PUT with a JSON-encoded body and decodes a 2xx JSON
// response into out. A nil body sends no payload; a nil out discards it.
func (c *Client) Put(path string, body any, out any) error {
	return c.do(http.MethodPut, path, body, out)
}

// Delete issues a DELETE for an absolute API path and decodes a 2xx JSON
// response into out. A nil out discards the body — no krantho DELETE
// endpoint takes a request body.
func (c *Client) Delete(path string, out any) error {
	return c.do(http.MethodDelete, path, nil, out)
}

// do joins baseURL with the absolute API path, sends the request with
// auth + JSON headers, and maps the response: 2xx decodes into out,
// anything else becomes an *APIError.
func (c *Client) do(method, path string, body any, out any) error {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return newAPIError(resp)
	}
	if out == nil {
		// Drain so the connection can be reused.
		_, err := io.Copy(io.Discard, resp.Body)
		return err
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// newAPIError builds an *APIError from a non-2xx response, parsing the
// krantho `{"error": "..."}` body and falling back to the HTTP status text.
func newAPIError(resp *http.Response) error {
	message := ""
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err == nil {
		var payload struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &payload) == nil && payload.Error != "" {
			message = payload.Error
		}
	}
	if message == "" {
		message = http.StatusText(resp.StatusCode)
	}
	if message == "" {
		message = resp.Status
	}
	return &APIError{Status: resp.StatusCode, Message: message}
}
