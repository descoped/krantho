package api

import "net/url"

// DocumentMeta is the system metadata block of a content document, mirroring
// DocumentMeta in packages/persistence/src/index.ts.
type DocumentMeta struct {
	Collection string  `json:"collection"`
	Slug       string  `json:"slug"`
	Locale     string  `json:"locale"`
	Version    int     `json:"version"`
	Status     string  `json:"status"`
	Source     string  `json:"source"`
	ChangedBy  *string `json:"changedBy"`
	CreatedAt  string  `json:"createdAt"`
}

// ContentDocument mirrors ContentDocument in packages/persistence/src/index.ts —
// the item shape GET /api/content/:collection returns (list-collection.ts).
type ContentDocument struct {
	Meta     DocumentMeta      `json:"meta"`
	Fields   map[string]any    `json:"fields"`
	Body     string            `json:"body"`
	HTML     string            `json:"html"`
	Sections map[string]string `json:"sections"`
}

// ContentList is the GET /api/content/:collection response body:
// { items, hasMore } (list-collection.ts). HasMore reports whether another
// page follows; the API never counts.
type ContentList struct {
	Items   []ContentDocument `json:"items"`
	HasMore bool              `json:"hasMore"`
}

// ContentPath returns the API path of a single document.
func ContentPath(collection, slug string) string {
	return "/api/content/" + url.PathEscape(collection) + "/" + url.PathEscape(slug)
}

// ContentCollectionPath returns the API path of a collection's documents.
func ContentCollectionPath(collection string) string {
	return "/api/content/" + url.PathEscape(collection)
}

// CreateContentRequest is the POST /api/content/:collection request body.
// create-content.ts reads exactly these keys: slug (required — it travels in
// the body, not the URL), fields (frontmatter map, defaults to {}), body
// (markdown, defaults to ""), and locale (optional — omitted when empty so
// the adapter's locale default applies).
type CreateContentRequest struct {
	Slug   string         `json:"slug"`
	Fields map[string]any `json:"fields"`
	Body   string         `json:"body"`
	Locale string         `json:"locale,omitempty"`
}

// CreateContentResult is the create-content.ts 201 response body:
// { slug, collection, message: "Created" }.
type CreateContentResult struct {
	Slug       string `json:"slug"`
	Collection string `json:"collection"`
	Message    string `json:"message"`
}

// CreateContent creates a document via POST /api/content/:collection. The
// server validates fields against the collection's merged schema — a failure
// is a 422 `{ error: "Validation failed", details }` — and writes the
// document as a new draft version.
func (c *Client) CreateContent(collection string, req CreateContentRequest) (*CreateContentResult, error) {
	var result CreateContentResult
	if err := c.Post(ContentCollectionPath(collection), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateContentRequest is the PUT /api/content/:collection/:slug request
// body. update-content.ts reads exactly these keys: fields (frontmatter map,
// defaults to {}), body (markdown — non-strings collapse to ""), and
// _version (must be a JSON number; when present the handler compares it to
// the stored meta.version and refuses a stale write with a 409, when absent
// the write is last-writer-wins). The CLI always sends the version it read.
type UpdateContentRequest struct {
	Fields  map[string]any `json:"fields"`
	Body    string         `json:"body"`
	Version int            `json:"_version"`
}

// UpdateContentResult is the update-content.ts 200 response body:
// { slug, collection, message: "Updated" }.
type UpdateContentResult struct {
	Slug       string `json:"slug"`
	Collection string `json:"collection"`
	Message    string `json:"message"`
}

// UpdateContent updates a document via PUT /api/content/:collection/:slug.
// The server validates fields against the collection's merged schema (422
// `{ error: "Validation failed", details }` on failure). A stale _version is
// a 409 *APIError carrying the handler's "Content has been modified by
// another user" message.
func (c *Client) UpdateContent(collection, slug string, req UpdateContentRequest) (*UpdateContentResult, error) {
	var result UpdateContentResult
	if err := c.Put(ContentPath(collection, slug), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteContentResult is the delete-content.ts 200 response body:
// { slug, collection, message: "Deleted" }.
type DeleteContentResult struct {
	Slug       string `json:"slug"`
	Collection string `json:"collection"`
	Message    string `json:"message"`
}

// DeleteContent deletes a document via DELETE /api/content/:collection/:slug.
// The endpoint takes no request body. delete-content.ts refuses a document
// other content references with a 409 `{ error: "Cannot delete: referenced
// by other content", references }` — that surfaces as a 409 *APIError.
func (c *Client) DeleteContent(collection, slug string) (*DeleteContentResult, error) {
	var result DeleteContentResult
	if err := c.Delete(ContentPath(collection, slug), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ContentPublishPath returns the API path of a document's status endpoint.
func ContentPublishPath(collection, slug string) string {
	return ContentPath(collection, slug) + "/publish"
}

// SetStatusRequest is the POST /api/content/:collection/:slug/publish request
// body for the explicit-status path of publish-content.ts: with a status key
// the handler sets exactly that status ("draft", "published", or "archived");
// without one it toggles published↔draft. The document is addressed in the
// site's default locale. The CLI always sends an explicit
// status — publish/unpublish must be idempotent, not state-dependent.
type SetStatusRequest struct {
	Status string `json:"status"`
}

// SetStatusResult is publish-content.ts's 200 response body:
// { slug, collection, locale, status, version, liveVersion, message }.
// Publishing makes the current version live (liveVersion == version);
// unpublishing and archiving leave nothing live (liveVersion null).
type SetStatusResult struct {
	Slug        string `json:"slug"`
	Collection  string `json:"collection"`
	Locale      string `json:"locale"`
	Status      string `json:"status"`
	Version     *int   `json:"version"`
	LiveVersion *int   `json:"liveVersion"`
	Message     string `json:"message"`
}

// SetContentStatus changes a document's status via
// POST /api/content/:collection/:slug/publish. A missing document is the
// handler's 404 `Content "<slug>" not found`; a status outside
// draft/published/archived is its 400.
func (c *Client) SetContentStatus(collection, slug, status string) (*SetStatusResult, error) {
	var result SetStatusResult
	if err := c.Post(ContentPublishPath(collection, slug), SetStatusRequest{Status: status}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetContent fetches a single document via GET /api/content/:collection/:slug.
// The adapter path of get-content.ts returns a persistence ContentDocument;
// the engine fallback path returns the same shape with a synthesized meta.
func (c *Client) GetContent(collection, slug string) (*ContentDocument, error) {
	var doc ContentDocument
	if err := c.Get(ContentPath(collection, slug), &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// ListContentOptions are the optional query filters for ListContent.
// Empty values are omitted from the request.
type ListContentOptions struct {
	Status string // "draft" or "published"
	Locale string // e.g. "en"
}

// ContentListPath returns the API path of a collection listing with the
// optional status/locale filters encoded.
func ContentListPath(collection string, opts ListContentOptions) string {
	path := ContentCollectionPath(collection)
	query := url.Values{}
	if opts.Status != "" {
		query.Set("status", opts.Status)
	}
	if opts.Locale != "" {
		query.Set("locale", opts.Locale)
	}
	if len(query) > 0 {
		path += "?" + query.Encode()
	}
	return path
}

// ListContent fetches the documents of a collection via
// GET /api/content/:collection with the optional status/locale filters.
func (c *Client) ListContent(collection string, opts ListContentOptions) (*ContentList, error) {
	var list ContentList
	if err := c.Get(ContentListPath(collection, opts), &list); err != nil {
		return nil, err
	}
	return &list, nil
}

// SearchContentOptions are the optional query filters for SearchContent.
// Empty values are omitted from the request.
type SearchContentOptions struct {
	Locale string // e.g. "en"
}

// ContentSearchPath returns the API path of a cross-collection search with
// the query term and the optional locale filter encoded.
func ContentSearchPath(query string, opts SearchContentOptions) string {
	values := url.Values{}
	values.Set("q", query)
	if opts.Locale != "" {
		values.Set("locale", opts.Locale)
	}
	return "/api/content/search?" + values.Encode()
}

// SearchHit is one item of the GET /api/content/search response body: a
// document's meta and fields, without its body, HTML or sections, and the
// snippet of text around the first match when the body or the fields matched.
type SearchHit struct {
	Meta    DocumentMeta   `json:"meta"`
	Fields  map[string]any `json:"fields"`
	Snippet string         `json:"snippet"`
}

// SearchResult is the GET /api/content/search response body:
// { items, hasMore } (search-content.ts). HasMore reports whether another
// page of matches follows; the API never counts.
type SearchResult struct {
	Items   []SearchHit `json:"items"`
	HasMore bool        `json:"hasMore"`
}

// SearchContent searches every collection via GET /api/content/search.
// search-content.ts matches the term case-insensitively against each
// document's slug, body, and JSON-encoded fields in one query and returns
// the matches as { items, hasMore } with items of { meta, fields, snippet }.
// A term shorter than 2 characters after trimming is its 400
// { error: "Search query must be at least 2 characters" }.
func (c *Client) SearchContent(query string, opts SearchContentOptions) (*SearchResult, error) {
	var result SearchResult
	if err := c.Get(ContentSearchPath(query, opts), &result); err != nil {
		return nil, err
	}
	return &result, nil
}
