package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// enrichPollInterval separates the enrich status polls. A variable so
// tests can shrink it.
var enrichPollInterval = 2 * time.Second

// enrichPollLimit caps how many status polls enrich watches before giving
// up — 900 polls at the default interval is 30 minutes; the job itself
// keeps running server-side. A variable so tests can shrink it.
var enrichPollLimit = 900

// newSeoCmd groups the SEO pipeline commands.
func newSeoCmd(opts *rootOptions) *cobra.Command {
	seo := &cobra.Command{
		Use:   "seo",
		Short: "SEO pipeline: file status, generation, and AI enrichment",
	}
	seo.AddCommand(newSeoStatusCmd(opts), newSeoGenerateCmd(opts), newSeoEnrichCmd(opts))
	return seo
}

func newSeoStatusCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "status",
		Short:        "Show which generated SEO files exist",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSeoStatus(cmd, opts)
		},
	}
}

// runSeoStatus renders GET /api/seo/status (seo-status.ts) as a FILE /
// STATUS / DETAIL table — one row per generated SEO file, the detail being
// the file's count in its own unit — or, with --json, the raw response.
func runSeoStatus(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.Raw(api.SeoStatusPath)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	status, err := sess.GetSeoStatus()
	if err != nil {
		return err
	}
	rows := [][]string{
		seoFileRow("structured-data.json", status.StructuredData),
		seoFileRow("faq-pages.json", status.FaqPages),
		seoFileRow("llms.txt", status.LlmsTxt),
		seoFileRow("sitemap.xml", status.Sitemap),
		seoFileRow("content-dates.json", status.ContentDates),
	}
	return output.Table(cmd.OutOrStdout(), []string{"FILE", "STATUS", "DETAIL"}, rows)
}

// seoFileRow renders one seo-status.ts file entry: present or missing plus
// the one count key the handler pairs with the file's kind.
func seoFileRow(name string, file api.SeoFileStatus) []string {
	if !file.Exists {
		return []string{name, "missing", "-"}
	}
	detail := "-"
	switch {
	case file.Entries != nil:
		detail = fmt.Sprintf("%d entries", *file.Entries)
	case file.Routes != nil:
		detail = fmt.Sprintf("%d routes", *file.Routes)
	case file.Bytes != nil:
		detail = fmt.Sprintf("%d bytes", *file.Bytes)
	case file.URLs != nil:
		detail = fmt.Sprintf("%d urls", *file.URLs)
	}
	return []string{name, "present", detail}
}

func newSeoGenerateCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "generate",
		Short:        "Regenerate the server-buildable SEO files",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSeoGenerate(cmd, opts)
		},
	}
}

// runSeoGenerate posts POST /api/seo/generate (seo-generate.ts) and prints
// each target's outcome — "generated", "failed", or the handler's
// requires-CLI pointer for files only @krantho/tools can build — or, with
// --json, the raw response.
func runSeoGenerate(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawPost(api.SeoGeneratePath, nil)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.GenerateSeo()
	if err != nil {
		return err
	}
	targets := make([]string, 0, len(result.Results))
	for target := range result.Results {
		targets = append(targets, target)
	}
	sort.Strings(targets)
	rows := make([][]string, 0, len(targets))
	for _, target := range targets {
		rows = append(rows, []string{target, result.Results[target]})
	}
	return output.Table(cmd.OutOrStdout(), []string{"TARGET", "RESULT"}, rows)
}

func newSeoEnrichCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "enrich <type>",
		Short: "Run AI enrichment and watch it to completion",
		Long: `Run AI enrichment and watch it to completion.

Starts a background enrichment job on the server — type is what to enrich,
e.g. meta-descriptions or archetype — and polls its status until the job
finishes, printing progress as items complete.`,
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSeoEnrich(cmd, opts, args[0])
		},
	}
}

// runSeoEnrich starts an enrichment job via POST /api/seo/enrich
// (seo-enrich.ts) and polls GET /api/seo/enrich/status until the job
// leaves "running" — the seo-enrich-runner.ts status union is running |
// complete | error. The human path prints a progress line whenever the
// counts move, then the final tally with every errored item; with --json
// the watch is silent and exactly one raw server response reaches stdout —
// the no-items start response, or the final status poll. An "error" job or
// any errored item fails the command.
func runSeoEnrich(cmd *cobra.Command, opts *rootOptions, enrichType string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	startRaw, err := sess.RawPost(api.SeoEnrichPath, api.SeoEnrichRequest{Type: enrichType})
	if err != nil {
		return err
	}
	var started api.SeoEnrichStarted
	if err := json.Unmarshal(startRaw, &started); err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	if started.JobID == "" {
		// The handler's no-items 200: nothing to do, no job to watch.
		if opts.json {
			return output.RawJSON(out, startRaw)
		}
		_, err = fmt.Fprintln(out, started.Message)
		return err
	}
	var progress io.Writer
	if !opts.json {
		progress = out
		if _, err := fmt.Fprintf(out, "Started enrichment job %s (%s, %d items)\n",
			started.JobID, started.Type, started.TotalItems); err != nil {
			return err
		}
	}
	finalRaw, final, err := watchEnrichment(progress, sess, started.JobID)
	if err != nil {
		return err
	}
	if opts.json {
		if err := output.RawJSON(out, finalRaw); err != nil {
			return err
		}
		return enrichExitError(final)
	}
	return reportEnrichment(out, final)
}

// watchEnrichment polls the job until it leaves "running", writing a
// progress line to w whenever it changes (a nil w watches silently), and
// returns the final poll both raw — for --json passthrough — and decoded.
func watchEnrichment(w io.Writer, sess *session, jobID string) (json.RawMessage, *api.SeoEnrichStatus, error) {
	lastLine := ""
	for poll := 0; poll < enrichPollLimit; poll++ {
		if poll > 0 {
			time.Sleep(enrichPollInterval)
		}
		raw, err := sess.Raw(api.SeoEnrichStatusQueryPath(jobID))
		if err != nil {
			return nil, nil, err
		}
		var status api.SeoEnrichStatus
		if err := json.Unmarshal(raw, &status); err != nil {
			return nil, nil, err
		}
		if w != nil {
			if line := progressLine(status.Progress); line != lastLine {
				if _, err := fmt.Fprintln(w, line); err != nil {
					return nil, nil, err
				}
				lastLine = line
			}
		}
		if status.Status != "running" {
			return raw, &status, nil
		}
	}
	return nil, nil, fmt.Errorf(
		"gave up watching enrichment job %s after %d polls — the job keeps running server-side", jobID, enrichPollLimit)
}

// progressLine renders one poll's counters, e.g.
// "  2/5 done (1 skipped, 0 errors) — generating pages/about".
func progressLine(p api.SeoEnrichProgress) string {
	done := p.Completed + p.Skipped + p.Errors
	line := fmt.Sprintf("  %d/%d done (%d skipped, %d errors)", done, p.Total, p.Skipped, p.Errors)
	if p.Current != "" {
		line += " — generating " + p.Current
	}
	return line
}

// reportEnrichment prints the terminal state — the summary tally plus
// every errored item — and fails the command via enrichExitError.
func reportEnrichment(w io.Writer, status *api.SeoEnrichStatus) error {
	verb := "complete"
	if status.Status == "error" {
		verb = "failed"
	}
	generated, skipped, errored := 0, 0, 0
	if status.Summary != nil {
		generated, skipped, errored = status.Summary.Generated, status.Summary.Skipped, status.Summary.Errors
	}
	if _, err := fmt.Fprintf(w, "Enrichment %s: %d generated, %d skipped, %d errors\n",
		verb, generated, skipped, errored); err != nil {
		return err
	}
	for _, item := range status.Items {
		if item.Status != "error" {
			continue
		}
		if _, err := fmt.Fprintf(w, "  failed %s/%s: %s\n", item.Collection, item.Slug, item.Error); err != nil {
			return err
		}
	}
	return enrichExitError(status)
}

// enrichExitError decides the exit for a terminal job state: an "error"
// status or any errored item is a failure.
func enrichExitError(status *api.SeoEnrichStatus) error {
	if status.Status == "error" {
		return fmt.Errorf("enrichment job %s ended in error", status.JobID)
	}
	errored := 0
	for _, item := range status.Items {
		if item.Status == "error" {
			errored++
		}
	}
	if errored > 0 {
		return fmt.Errorf("%d of %d items failed to enrich", errored, len(status.Items))
	}
	return nil
}
