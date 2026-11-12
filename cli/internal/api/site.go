package api

const (
	// CollectionsPath is the GET /api/collections endpoint.
	CollectionsPath = "/api/collections"
	// SiteConfigPath is the GET /api/site-config endpoint.
	SiteConfigPath = "/api/site-config"
)

// Collection is one item of the GET /api/collections response
// (list-collections.ts): a defined collection with its content source.
// The handler leaves directory undefined for collections without one
// (database-sourced), so the key may be absent from the response.
type Collection struct {
	Name      string  `json:"name"`
	Source    string  `json:"source"` // "filesystem" or "database"
	Directory *string `json:"directory,omitempty"`
}

// CollectionList is the GET /api/collections response body:
// { collections } (list-collections.ts).
type CollectionList struct {
	Collections []Collection `json:"collections"`
}

// ListCollections fetches all defined collections via GET /api/collections.
func (c *Client) ListCollections() (*CollectionList, error) {
	var list CollectionList
	if err := c.Get(CollectionsPath, &list); err != nil {
		return nil, err
	}
	return &list, nil
}

// SiteIdentity is the site block of the GET /api/site-config response
// (site-config.ts): the project's SiteConfig identity values, with
// supportedLocales/defaultLocale falling back to the site language.
type SiteIdentity struct {
	Domain           string   `json:"domain"`
	Name             string   `json:"name"`
	Language         string   `json:"language"`
	BaseURL          string   `json:"baseUrl"`
	SupportedLocales []string `json:"supportedLocales"`
	DefaultLocale    string   `json:"defaultLocale"`
}

// SchemaSummary is one collections item of the GET /api/site-config
// response (site-config.ts): the collection name, content source, and the
// number of fields its code-defined Zod schema declares.
type SchemaSummary struct {
	Name       string `json:"name"`
	Source     string `json:"source"`
	FieldCount int    `json:"fieldCount"`
}

// SiteConfig is the GET /api/site-config response body:
// { site, collections } (site-config.ts).
type SiteConfig struct {
	Site        SiteIdentity    `json:"site"`
	Collections []SchemaSummary `json:"collections"`
}

// GetSiteConfig fetches the site configuration via GET /api/site-config.
func (c *Client) GetSiteConfig() (*SiteConfig, error) {
	var config SiteConfig
	if err := c.Get(SiteConfigPath, &config); err != nil {
		return nil, err
	}
	return &config, nil
}
