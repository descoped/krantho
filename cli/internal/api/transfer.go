package api

import (
	"encoding/json"
	"net/url"
)

// ExportContentPath selects portable JSON or Markdown and current or published
// snapshots. An optional locale filters the document identities exported.
func ExportContentPath(collection, format, locale, state string) string {
	query := url.Values{}
	query.Set("format", format)
	query.Set("state", state)
	if locale != "" {
		query.Set("locale", locale)
	}
	return ContentCollectionPath(collection) + "/export?" + query.Encode()
}

// MarkdownExportFile is one document of the markdown-format export: the
// slug plus the complete file content — a `---` fenced frontmatter block
// with every value JSON-encoded (valid YAML), then the body — exactly as
// export-content.ts builds it.
type MarkdownExportFile struct {
	Slug    string `json:"slug"`
	Content string `json:"content"`
}

// MarkdownExport is the export-content.ts format=markdown 200 response
// body: { collection, format: "markdown", count, files }.
type MarkdownExport struct {
	Collection string               `json:"collection"`
	Format     string               `json:"format"`
	Count      int                  `json:"count"`
	Files      []MarkdownExportFile `json:"files"`
}

// ExportContentMarkdown fetches a collection export in markdown format via
// GET /api/content/:collection/export?format=markdown.
func (c *Client) ExportContentMarkdown(collection, locale, state string) (*MarkdownExport, error) {
	var export MarkdownExport
	if err := c.Get(ExportContentPath(collection, "markdown", locale, state), &export); err != nil {
		return nil, err
	}
	return &export, nil
}

// BundleExportPath is the full-site export endpoint — GET /api/export/bundle
// (export-bundle.ts, admin role). The 200 body is { version, timestamp,
// content, media, schemas, checksums, warnings? }.
const BundleExportPath = "/api/export/bundle"

// BundleSummary decodes just enough of an export bundle to report what it
// holds: the manifest version and the portable document arrays of every
// collection. The bundle itself always travels verbatim.
type BundleSummary struct {
	Version int                          `json:"version"`
	Content map[string][]json.RawMessage `json:"content"`
}

// ImportContentPath returns the API path of a collection bulk import —
// POST /api/content/:collection/import (import-content.ts, editor role).
func ImportContentPath(collection string) string {
	return ContentCollectionPath(collection) + "/import"
}

// DocumentIdentity addresses one collection, slug and locale.
type DocumentIdentity struct {
	Collection string `json:"collection"`
	Slug       string `json:"slug"`
	Locale     string `json:"locale"`
}

// ImportItem retains every author-owned value and the repository agreement.
type ImportItem struct {
	Identity DocumentIdentity `json:"identity"`
	Contract json.RawMessage  `json:"contract"`
	Fields   map[string]any   `json:"fields"`
	Metadata map[string]any   `json:"metadata"`
	Defaults []any            `json:"defaults"`
	Body     string           `json:"body"`
	Basis    json.RawMessage  `json:"basis,omitempty"`
}

// ImportContentRequest is the POST /api/content/:collection/import request
// body: { items: [...] } — an empty items array is the handler's 400.
type ImportContentRequest struct {
	Items []ImportItem `json:"items"`
}

// ImportItemResult is one entry of the import-content.ts results array:
// imported true on a write, false with the error — a schema validation
// failure ("field: message" lines joined with "; ") or the adapter's write
// error — otherwise.
type ImportItemResult struct {
	Slug      string `json:"slug"`
	Imported  bool   `json:"imported"`
	Unchanged bool   `json:"unchanged"`
	Error     string `json:"error"`
}

// ImportContentResult is the import-content.ts 200 response body:
// { collection, imported, total, results } — per-item failures land in
// results, never in the HTTP status.
type ImportContentResult struct {
	Collection string             `json:"collection"`
	Imported   int                `json:"imported"`
	Total      int                `json:"total"`
	Results    []ImportItemResult `json:"results"`
}

// ImportContent bulk-imports documents via
// POST /api/content/:collection/import.
func (c *Client) ImportContent(collection string, req ImportContentRequest) (*ImportContentResult, error) {
	var result ImportContentResult
	if err := c.Post(ImportContentPath(collection), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// BundleImportPath imports arrays of portable documents per collection through
// reviewed draft saves. Unchanged values create no revision; conflicts need review.
const BundleImportPath = "/api/import/bundle"

// BundleImportError is one entry of the import-bundle.ts errors array.
type BundleImportError struct {
	Collection string `json:"collection"`
	Slug       string `json:"slug"`
	Error      string `json:"error"`
}

// ImportBundleResult is the import-bundle.ts 200 response body:
// { imported, skipped, errors?, checkpoint: "created" | "unavailable" }.
type ImportBundleResult struct {
	Imported   int                 `json:"imported"`
	Skipped    int                 `json:"skipped"`
	Errors     []BundleImportError `json:"errors"`
	Checkpoint string              `json:"checkpoint"`
}

// ImportBundle posts a bundle verbatim to POST /api/import/bundle — the
// raw JSON is never reshaped, so keys the CLI does not model (checksums,
// media, schemas) reach the server untouched.
func (c *Client) ImportBundle(bundle json.RawMessage) (*ImportBundleResult, error) {
	var result ImportBundleResult
	if err := c.Post(BundleImportPath, bundle, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
