package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// newInfoCmd builds the info command: a project summary combining
// GET /api/site-config and GET /api/collections.
func newInfoCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "info",
		Short:        "Summarize the project: site identity, API origin, auth state, collections",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runInfo(cmd, opts)
		},
	}
}

// runInfo fetches site config + collections and renders a readable summary
// or, with --json, both raw responses combined verbatim.
func runInfo(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		site, err := sess.Raw(api.SiteConfigPath)
		if err != nil {
			return err
		}
		collections, err := sess.Raw(api.CollectionsPath)
		if err != nil {
			return err
		}
		combined, err := json.Marshal(map[string]json.RawMessage{
			"siteConfig":  site,
			"collections": collections,
		})
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), combined)
	}
	siteConfig, err := sess.GetSiteConfig()
	if err != nil {
		return err
	}
	collections, err := sess.ListCollections()
	if err != nil {
		return err
	}
	return writeInfoSummary(cmd.OutOrStdout(), opts.baseURL, authState(sess), siteConfig.Site, collections)
}

// authState reports how requests to the resolved API origin authenticate:
// "token stored" when a credentials entry exists, "anonymous" otherwise.
func authState(sess *session) string {
	if sess.anonymous() {
		return "anonymous"
	}
	return "token stored"
}

// writeInfoSummary renders the human-readable project summary: site
// identity, the API origin + auth state, and the collections table.
func writeInfoSummary(w io.Writer, origin, auth string, site api.SiteIdentity, list *api.CollectionList) error {
	fmt.Fprintln(w, "Site")
	fmt.Fprintf(w, "  Name:      %s\n", site.Name)
	fmt.Fprintf(w, "  Domain:    %s\n", site.Domain)
	fmt.Fprintf(w, "  Base URL:  %s\n", site.BaseURL)
	fmt.Fprintf(w, "  Language:  %s\n", site.Language)
	fmt.Fprintf(w, "  Locales:   %s (default %s)\n",
		strings.Join(site.SupportedLocales, ", "), site.DefaultLocale)
	fmt.Fprintln(w, "\nAPI")
	fmt.Fprintf(w, "  Origin:  %s\n", origin)
	fmt.Fprintf(w, "  Auth:    %s\n", auth)
	fmt.Fprintln(w, "\nCollections")
	rows := make([][]string, 0, len(list.Collections))
	for _, col := range list.Collections {
		directory := ""
		if col.Directory != nil {
			directory = *col.Directory
		}
		rows = append(rows, []string{col.Name, col.Source, directory})
	}
	return output.Table(w, []string{"NAME", "SOURCE", "DIRECTORY"}, rows)
}
