package cmd

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/creds"
)

// errSessionExpired is the guidance when neither the stored access token
// nor the refresh flow can authenticate the user.
var errSessionExpired = errors.New("session expired — run `krantho auth login` to authenticate again")

// session is the client every authenticated command talks through: an
// api.Client for the resolved API origin plus the credentials stored for
// it. It recovers from an expired access token transparently — on a 401
// with a refresh token stored, it rotates the pair via /api/auth/refresh,
// persists it, and retries the failed request exactly once. auth
// login/logout stay off this path: login is the credential acquisition,
// logout only touches the local store.
type session struct {
	opts *rootOptions
	// entry is the credentials stored for the origin; the zero Entry means
	// anonymous (no entry stored).
	entry creds.Entry
	// refreshed guards the recovery budget: at most one refresh attempt
	// per command invocation, never a retry loop.
	refreshed bool
	client    *api.Client
}

// newSession builds the session for the resolved API origin,
// authenticating with the stored access token when one exists (anonymous
// otherwise).
func newSession(opts *rootOptions) (*session, error) {
	store, err := openCreds(opts)
	if err != nil {
		return nil, err
	}
	entry, _ := store.Get(opts.baseURL)
	return &session{
		opts:   opts,
		entry:  entry,
		client: api.New(opts.baseURL, entry.AccessToken, nil),
	}, nil
}

// anonymous reports whether no credentials are stored for the origin.
func (s *session) anonymous() bool {
	return s.entry == (creds.Entry{})
}

// withRefreshRetry runs call against the session's client, recovering from
// an expired access token once. On a 401: with no refresh token stored the
// original error surfaces untouched; otherwise the token pair is rotated
// via /api/auth/refresh, persisted, and call retried exactly once. A 401
// after that — from the refresh itself or the retried call — means the
// session is gone and the user must log in again. Other errors surface
// as-is.
func withRefreshRetry[T any](s *session, call func(*api.Client) (T, error)) (T, error) {
	result, err := call(s.client)
	if err == nil || !isUnauthorized(err) {
		return result, err
	}
	if s.entry.RefreshToken == "" {
		return result, err
	}
	var zero T
	if s.refreshed {
		return zero, errSessionExpired
	}
	if err := s.refreshCreds(); err != nil {
		if isUnauthorized(err) {
			return zero, errSessionExpired
		}
		return zero, err
	}
	result, err = call(s.client)
	if err != nil && isUnauthorized(err) {
		return zero, errSessionExpired
	}
	return result, err
}

// refreshCreds rotates the token pair via POST /api/auth/refresh — the
// handler reads the refresh token from the krantho_refresh cookie —
// persists the rotated pair under the API origin, and re-tokens the
// client. When the server rotates only the access token, the stored
// refresh token is kept.
func (s *session) refreshCreds() error {
	s.refreshed = true
	result, err := api.New(s.opts.baseURL, "", nil).Refresh(s.entry.RefreshToken)
	if err != nil {
		return err
	}
	if result.AccessToken == "" {
		return errors.New("refresh succeeded but the server set no krantho_access cookie")
	}
	refreshed := creds.Entry{AccessToken: result.AccessToken, RefreshToken: result.RefreshToken}
	if refreshed.RefreshToken == "" {
		refreshed.RefreshToken = s.entry.RefreshToken
	}
	if err := storeEntry(s.opts, refreshed); err != nil {
		return err
	}
	s.entry = refreshed
	s.client = api.New(s.opts.baseURL, refreshed.AccessToken, nil)
	return nil
}

// isUnauthorized reports whether err is an API 401.
func isUnauthorized(err error) bool {
	var apiErr *api.APIError
	return errors.As(err, &apiErr) && apiErr.Status == http.StatusUnauthorized
}

// Raw fetches an API path and returns the response JSON verbatim — the
// machine-readable (--json) path never reshapes what the server sent, so
// fields the CLI's typed structs don't know about are preserved.
func (s *session) Raw(path string) (json.RawMessage, error) {
	return withRefreshRetry(s, func(c *api.Client) (json.RawMessage, error) {
		var raw json.RawMessage
		if err := c.Get(path, &raw); err != nil {
			return nil, err
		}
		return raw, nil
	})
}

// RawPost issues a POST with a JSON-encoded body and returns the response
// JSON verbatim — Raw's counterpart for write commands, so --json output
// never reshapes what the server sent.
func (s *session) RawPost(path string, body any) (json.RawMessage, error) {
	return withRefreshRetry(s, func(c *api.Client) (json.RawMessage, error) {
		var raw json.RawMessage
		if err := c.Post(path, body, &raw); err != nil {
			return nil, err
		}
		return raw, nil
	})
}

// RawPut issues a PUT with a JSON-encoded body and returns the response
// JSON verbatim — RawPost's counterpart for update commands, so --json
// output never reshapes what the server sent.
func (s *session) RawPut(path string, body any) (json.RawMessage, error) {
	return withRefreshRetry(s, func(c *api.Client) (json.RawMessage, error) {
		var raw json.RawMessage
		if err := c.Put(path, body, &raw); err != nil {
			return nil, err
		}
		return raw, nil
	})
}

// RawDelete issues a DELETE and returns the response JSON verbatim — Raw's
// counterpart for delete commands, so --json output never reshapes what the
// server sent.
func (s *session) RawDelete(path string) (json.RawMessage, error) {
	return withRefreshRetry(s, func(c *api.Client) (json.RawMessage, error) {
		var raw json.RawMessage
		if err := c.Delete(path, &raw); err != nil {
			return nil, err
		}
		return raw, nil
	})
}

// Me returns the identity behind the stored token via GET /api/auth/me.
func (s *session) Me() (*api.Identity, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.Identity, error) {
		return c.Me()
	})
}

// ListContent fetches the documents of a collection via
// GET /api/content/:collection with the optional status/locale filters.
func (s *session) ListContent(collection string, opts api.ListContentOptions) (*api.ContentList, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.ContentList, error) {
		return c.ListContent(collection, opts)
	})
}

// GetContent fetches a single document via GET /api/content/:collection/:slug.
func (s *session) GetContent(collection, slug string) (*api.ContentDocument, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.ContentDocument, error) {
		return c.GetContent(collection, slug)
	})
}

// SearchContent searches every collection via GET /api/content/search with
// the optional locale filter.
func (s *session) SearchContent(query string, opts api.SearchContentOptions) (*api.SearchResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SearchResult, error) {
		return c.SearchContent(query, opts)
	})
}

// CreateContent creates a document via POST /api/content/:collection.
func (s *session) CreateContent(collection string, req api.CreateContentRequest) (*api.CreateContentResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.CreateContentResult, error) {
		return c.CreateContent(collection, req)
	})
}

// UpdateContent updates a document via PUT /api/content/:collection/:slug.
func (s *session) UpdateContent(collection, slug string, req api.UpdateContentRequest) (*api.UpdateContentResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.UpdateContentResult, error) {
		return c.UpdateContent(collection, slug, req)
	})
}

// DeleteContent deletes a document via DELETE /api/content/:collection/:slug.
func (s *session) DeleteContent(collection, slug string) (*api.DeleteContentResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.DeleteContentResult, error) {
		return c.DeleteContent(collection, slug)
	})
}

// SetContentStatus changes a document's status via
// POST /api/content/:collection/:slug/publish.
func (s *session) SetContentStatus(collection, slug, status string) (*api.SetStatusResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SetStatusResult, error) {
		return c.SetContentStatus(collection, slug, status)
	})
}

// GetSchema fetches a collection's merged field schema via
// GET /api/schema/:collection.
func (s *session) GetSchema(collection string) (*api.CollectionSchema, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.CollectionSchema, error) {
		return c.GetSchema(collection)
	})
}

// ExportSchema fetches a collection's schema as generated Zod source via
// GET /api/schema/:collection/export.
func (s *session) ExportSchema(collection string) (*api.SchemaExport, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SchemaExport, error) {
		return c.ExportSchema(collection)
	})
}

// SaveRuntimeField adds or updates a runtime field via
// PUT /api/schema/:collection/fields.
func (s *session) SaveRuntimeField(collection string, req api.SaveRuntimeFieldRequest) (*api.SaveRuntimeFieldResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SaveRuntimeFieldResult, error) {
		return c.SaveRuntimeField(collection, req)
	})
}

// DeleteRuntimeField removes a runtime field via
// DELETE /api/schema/:collection/fields/:field.
func (s *session) DeleteRuntimeField(collection, field string) (*api.DeleteRuntimeFieldResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.DeleteRuntimeFieldResult, error) {
		return c.DeleteRuntimeField(collection, field)
	})
}

// ExportContentMarkdown fetches a collection export in markdown format via
// GET /api/content/:collection/export?format=markdown.
func (s *session) ExportContentMarkdown(collection, locale, state string) (*api.MarkdownExport, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.MarkdownExport, error) {
		return c.ExportContentMarkdown(collection, locale, state)
	})
}

// ImportContent bulk-imports documents via
// POST /api/content/:collection/import.
func (s *session) ImportContent(collection string, req api.ImportContentRequest) (*api.ImportContentResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.ImportContentResult, error) {
		return c.ImportContent(collection, req)
	})
}

// ImportBundle posts a full-site bundle verbatim to POST /api/import/bundle.
func (s *session) ImportBundle(bundle json.RawMessage) (*api.ImportBundleResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.ImportBundleResult, error) {
		return c.ImportBundle(bundle)
	})
}

// GetSeoStatus fetches the SEO file status via GET /api/seo/status.
func (s *session) GetSeoStatus() (*api.SeoStatus, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SeoStatus, error) {
		return c.GetSeoStatus()
	})
}

// GenerateSeo regenerates the server-buildable SEO files via
// POST /api/seo/generate.
func (s *session) GenerateSeo() (*api.SeoGenerateResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SeoGenerateResult, error) {
		return c.GenerateSeo()
	})
}

// CreateCheckpoint creates a manual checkpoint via POST /api/checkpoints.
func (s *session) CreateCheckpoint(req api.CreateCheckpointRequest) (*api.Checkpoint, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.Checkpoint, error) {
		return c.CreateCheckpoint(req)
	})
}

// ListCheckpoints fetches all checkpoints via GET /api/checkpoints.
func (s *session) ListCheckpoints() (*api.CheckpointList, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.CheckpointList, error) {
		return c.ListCheckpoints()
	})
}

// RestoreCheckpoint rewinds the content store to a checkpoint via
// POST /api/checkpoints/:version/restore.
func (s *session) RestoreCheckpoint(version int) (*api.RestoreCheckpointResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.RestoreCheckpointResult, error) {
		return c.RestoreCheckpoint(version)
	})
}

// DeleteCheckpoint deletes a checkpoint via DELETE /api/checkpoints/:version.
func (s *session) DeleteCheckpoint(version int) (*api.DeleteCheckpointResult, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.DeleteCheckpointResult, error) {
		return c.DeleteCheckpoint(version)
	})
}

// GetSiteConfig fetches the site configuration via GET /api/site-config.
func (s *session) GetSiteConfig() (*api.SiteConfig, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.SiteConfig, error) {
		return c.GetSiteConfig()
	})
}

// ListCollections fetches all defined collections via GET /api/collections.
func (s *session) ListCollections() (*api.CollectionList, error) {
	return withRefreshRetry(s, func(c *api.Client) (*api.CollectionList, error) {
		return c.ListCollections()
	})
}
