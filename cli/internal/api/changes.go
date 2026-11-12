package api

import "net/url"

// ChangesBaseline names what production last took from the repository: the
// commit a pull starts from (nil when the build recorded none), the content
// version and when it was imported.
type ChangesBaseline struct {
	Commit      *string `json:"commit"`
	RepoVersion int64   `json:"repoVersion"`
	ImportedAt  string  `json:"importedAt"`
}

// ContentChange is one file production's editors changed, as
// GET /api/changes lists it (content-changes.ts): an add or edit carries the
// file to write, a delete carries none.
type ContentChange struct {
	Action     string  `json:"action"`
	Collection string  `json:"collection"`
	Slug       string  `json:"slug"`
	Locale     string  `json:"locale"`
	Path       string  `json:"path"`
	Checksum   *string `json:"checksum"`
	Content    *string `json:"content"`
}

// Changes is every page of GET /api/changes put together.
type Changes struct {
	Baseline ChangesBaseline
	Changes  []ContentChange
}

// changesPage is one 200 response body of GET /api/changes.
type changesPage struct {
	Baseline ChangesBaseline `json:"baseline"`
	Changes  []ContentChange `json:"changes"`
	Next     *string         `json:"next"`
}

// ContentChanges reads GET /api/changes page by page until the server names
// no next cursor. The baseline is the same on every page of one import.
func (c *Client) ContentChanges() (*Changes, error) {
	all := &Changes{}
	cursor := ""
	for {
		query := url.Values{}
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		path := "/api/changes"
		if encoded := query.Encode(); encoded != "" {
			path += "?" + encoded
		}
		var page changesPage
		if err := c.Get(path, &page); err != nil {
			return nil, err
		}
		all.Baseline = page.Baseline
		all.Changes = append(all.Changes, page.Changes...)
		if page.Next == nil || *page.Next == "" {
			return all, nil
		}
		cursor = *page.Next
	}
}
