package api

import "net/url"

// SeoStatusPath is the SEO file status endpoint — GET /api/seo/status
// (seo-status.ts). The 200 body carries one SeoFileStatus per generated
// file: { structuredData, faqPages, llmsTxt, sitemap, contentDates }.
const SeoStatusPath = "/api/seo/status"

// SeoFileStatus is one file's entry of the seo-status.ts response. At most
// one count key accompanies exists=true — entries (JSON files), routes
// (faq-pages.json), bytes (llms.txt), or urls (sitemap.xml) — so the
// counts are pointers to keep absent distinct from zero.
type SeoFileStatus struct {
	Exists  bool   `json:"exists"`
	Entries *int   `json:"entries"`
	Routes  *int   `json:"routes"`
	Bytes   *int64 `json:"bytes"`
	URLs    *int   `json:"urls"`
}

// SeoStatus is the seo-status.ts 200 response body.
type SeoStatus struct {
	StructuredData SeoFileStatus `json:"structuredData"`
	FaqPages       SeoFileStatus `json:"faqPages"`
	LlmsTxt        SeoFileStatus `json:"llmsTxt"`
	Sitemap        SeoFileStatus `json:"sitemap"`
	ContentDates   SeoFileStatus `json:"contentDates"`
}

// GetSeoStatus fetches the SEO file status via GET /api/seo/status.
func (c *Client) GetSeoStatus() (*SeoStatus, error) {
	var status SeoStatus
	if err := c.Get(SeoStatusPath, &status); err != nil {
		return nil, err
	}
	return &status, nil
}

// SeoGeneratePath is the SEO regeneration endpoint — POST /api/seo/generate
// (seo-generate.ts, editor role). No request body; the 200 response is
// { results } mapping each target to "generated", "failed", or a
// "requires CLI: ..." pointer for files only @krantho/tools can build.
const SeoGeneratePath = "/api/seo/generate"

// SeoGenerateResult is the seo-generate.ts 200 response body.
type SeoGenerateResult struct {
	Results map[string]string `json:"results"`
}

// GenerateSeo regenerates the server-buildable SEO files via
// POST /api/seo/generate.
func (c *Client) GenerateSeo() (*SeoGenerateResult, error) {
	var result SeoGenerateResult
	if err := c.Post(SeoGeneratePath, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// SeoEnrichPath is the AI enrichment trigger — POST /api/seo/enrich
// (seo-enrich.ts, admin role): starts the one-at-a-time background job.
// 202 { jobId, status: "running", type, totalItems } on start;
// 200 { jobId: null, message } when nothing matches; 409 { error, jobId }
// while another job runs; 400 { error } for a scope other than all,
// collection or item, a collection or item scope without a configured
// collection, an item without a slug, or when no LLM adapter resolves.
const SeoEnrichPath = "/api/seo/enrich"

// SeoEnrichRequest is the seo-enrich.ts request body the CLI sends. The
// handler also reads scope/collection/slug/force: without scope, a slug
// means item, a collection alone means collection, and neither means all.
// The CLI enriches everything, so only type travels and the scope is all.
type SeoEnrichRequest struct {
	Type string `json:"type"`
}

// SeoEnrichStarted decodes both start responses: a 202 carries JobID with
// status "running"; the no-items 200 carries jobId null — an empty JobID —
// plus Message.
type SeoEnrichStarted struct {
	JobID      string `json:"jobId"`
	Status     string `json:"status"`
	Type       string `json:"type"`
	TotalItems int    `json:"totalItems"`
	Message    string `json:"message"`
}

// SeoEnrichStatusPath is the job poll endpoint — GET /api/seo/enrich/status
// (seo-enrich.ts): 200 with the job snapshot, 404 { error } when no job is
// active or the jobId query names a different one.
const SeoEnrichStatusPath = "/api/seo/enrich/status"

// SeoEnrichStatusQueryPath returns the poll path pinned to one job.
func SeoEnrichStatusQueryPath(jobID string) string {
	return SeoEnrichStatusPath + "?jobId=" + url.QueryEscape(jobID)
}

// SeoEnrichProgress is the poll response's progress block: counted item
// outcomes plus the "collection/slug" currently generating (null — an
// empty string — between items).
type SeoEnrichProgress struct {
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Skipped   int    `json:"skipped"`
	Errors    int    `json:"errors"`
	Current   string `json:"current"`
}

// SeoEnrichItem is one work item of the job, mirroring EnrichJob.items in
// seo-enrich-runner.ts: status is pending | generating | complete |
// skipped | error, with the outcome in result or error.
type SeoEnrichItem struct {
	Collection string `json:"collection"`
	Slug       string `json:"slug"`
	Status     string `json:"status"`
	Result     string `json:"result"`
	Error      string `json:"error"`
}

// SeoEnrichSummary is the job's final tally, set when the runner finishes.
type SeoEnrichSummary struct {
	Generated int `json:"generated"`
	Skipped   int `json:"skipped"`
	Errors    int `json:"errors"`
}

// SeoEnrichStatus is the GET /api/seo/enrich/status 200 body. Status is
// EnrichJob.status (seo-enrich-runner.ts): "running" | "complete" |
// "error" — the poll loop stops on the latter two.
type SeoEnrichStatus struct {
	JobID    string            `json:"jobId"`
	Status   string            `json:"status"`
	Type     string            `json:"type"`
	Progress SeoEnrichProgress `json:"progress"`
	Items    []SeoEnrichItem   `json:"items"`
	Summary  *SeoEnrichSummary `json:"summary"`
}
