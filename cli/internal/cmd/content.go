package cmd

import (
	"fmt"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// newContentCmd groups the content commands. The read commands live in this
// file; the write commands (create, set, delete, publish, unpublish) live in
// content_write.go.
func newContentCmd(opts *rootOptions) *cobra.Command {
	content := &cobra.Command{
		Use:   "content",
		Short: "Manage content documents via the API",
	}
	content.AddCommand(
		newContentListCmd(opts),
		newContentGetCmd(opts),
		newContentSearchCmd(opts),
		newContentCreateCmd(opts),
		newContentSetCmd(opts),
		newContentDeleteCmd(opts),
		newContentPublishCmd(opts),
		newContentUnpublishCmd(opts),
		newContentEditCmd(opts),
	)
	return content
}

func newContentListCmd(opts *rootOptions) *cobra.Command {
	var status, locale string
	list := &cobra.Command{
		Use:          "list <collection>",
		Short:        "List the documents of a collection",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentList(cmd, opts, args[0], status, locale)
		},
	}
	list.Flags().StringVar(&status, "status", "", "filter by status (draft or published)")
	list.Flags().StringVar(&locale, "locale", "", "filter by locale (e.g. en)")
	return list
}

// runContentList fetches GET /api/content/:collection and renders a table
// (slug, title, status, locale) or, with --json, the raw response.
func runContentList(cmd *cobra.Command, opts *rootOptions, collection, status, locale string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	filters := api.ListContentOptions{Status: status, Locale: locale}
	if opts.json {
		raw, err := sess.Raw(api.ContentListPath(collection, filters))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	list, err := sess.ListContent(collection, filters)
	if err != nil {
		return err
	}
	rows := make([][]string, 0, len(list.Items))
	for _, item := range list.Items {
		rows = append(rows, []string{
			item.Meta.Slug, fieldString(item.Fields, "title"), item.Meta.Status, item.Meta.Locale,
		})
	}
	return output.Table(cmd.OutOrStdout(), []string{"SLUG", "TITLE", "STATUS", "LOCALE"}, rows)
}

func newContentGetCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "get <collection> <slug>",
		Short:        "Show a single content document",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentGet(cmd, opts, args[0], args[1])
		},
	}
}

// runContentGet fetches GET /api/content/:collection/:slug and renders a
// markdown document (frontmatter + body) or, with --json, the raw response.
func runContentGet(cmd *cobra.Command, opts *rootOptions, collection, slug string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.Raw(api.ContentPath(collection, slug))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	doc, err := sess.GetContent(collection, slug)
	if err != nil {
		return err
	}
	return output.MarkdownDocument(cmd.OutOrStdout(), doc.Fields, doc.Body)
}

func newContentSearchCmd(opts *rootOptions) *cobra.Command {
	var locale string
	search := &cobra.Command{
		Use:          "search <query>",
		Short:        "Search every collection for matching documents",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentSearch(cmd, opts, args[0], locale)
		},
	}
	search.Flags().StringVar(&locale, "locale", "", "filter by locale (e.g. en)")
	return search
}

// runContentSearch fetches GET /api/content/search and renders the hits as a
// table (collection, slug, title, status, locale) or, with --json, the raw
// response. No hits renders a friendly line instead of a bare header.
func runContentSearch(cmd *cobra.Command, opts *rootOptions, query, locale string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	filters := api.SearchContentOptions{Locale: locale}
	if opts.json {
		raw, err := sess.Raw(api.ContentSearchPath(query, filters))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	list, err := sess.SearchContent(query, filters)
	if err != nil {
		return err
	}
	if len(list.Items) == 0 {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "No documents match %q\n", query)
		return err
	}
	rows := make([][]string, 0, len(list.Items))
	for _, item := range list.Items {
		rows = append(rows, []string{
			item.Meta.Collection, item.Meta.Slug, fieldString(item.Fields, "title"),
			item.Meta.Status, item.Meta.Locale,
		})
	}
	return output.Table(cmd.OutOrStdout(),
		[]string{"COLLECTION", "SLUG", "TITLE", "STATUS", "LOCALE"}, rows)
}

// fieldString renders a content field value for table display; a missing
// or null field renders empty.
func fieldString(fields map[string]any, key string) string {
	value, ok := fields[key]
	if !ok || value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return fmt.Sprint(value)
}
