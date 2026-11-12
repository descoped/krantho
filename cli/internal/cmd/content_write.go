package cmd

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

func newContentCreateCmd(opts *rootOptions) *cobra.Command {
	var fields []string
	var locale, bodyFile string
	create := &cobra.Command{
		Use:          "create <collection> <slug>",
		Short:        "Create a content document",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentCreate(cmd, opts, args[0], args[1], fields, locale, bodyFile)
		},
	}
	create.Flags().StringArrayVar(&fields, "field", nil, "document field as key=value (repeatable)")
	create.Flags().StringVar(&locale, "locale", "", "locale of the new document (e.g. en)")
	create.Flags().StringVar(&bodyFile, "body", "", "file with the markdown body (- reads stdin)")
	return create
}

// runContentCreate posts a new document to POST /api/content/:collection —
// the slug travels in the JSON body next to fields, body, and locale
// (create-content.ts) — and prints a confirmation with the created
// collection/slug or, with --json, the raw 201 response.
func runContentCreate(cmd *cobra.Command, opts *rootOptions, collection, slug string, fieldFlags []string, locale, bodyFile string) error {
	fields, err := parseFieldFlags(fieldFlags)
	if err != nil {
		return err
	}
	body, err := readBodySource(cmd.InOrStdin(), bodyFile)
	if err != nil {
		return err
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	req := api.CreateContentRequest{Slug: slug, Fields: fields, Body: body, Locale: locale}
	if opts.json {
		raw, err := sess.RawPost(api.ContentCollectionPath(collection), req)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.CreateContent(collection, req)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Created %s/%s\n", result.Collection, result.Slug)
	return err
}

func newContentSetCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "set <collection> <slug> <field> <value>",
		Short:        "Set one field of a content document",
		Args:         cobra.ExactArgs(4),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentSet(cmd, opts, args[0], args[1], args[2], args[3])
		},
	}
}

// runContentSet is a read-modify-write: it fetches the document, overwrites
// the one field (a string value — like create, the server-side schema is the
// arbiter of types), and PUTs fields + body back with the version it read as
// _version, so a concurrent edit surfaces as update-content.ts's 409 instead
// of being silently overwritten. Prints a confirmation or, with --json, the
// raw PUT response.
func runContentSet(cmd *cobra.Command, opts *rootOptions, collection, slug, field, value string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	doc, err := sess.GetContent(collection, slug)
	if err != nil {
		return err
	}
	fields := doc.Fields
	if fields == nil {
		fields = map[string]any{}
	}
	fields[field] = value
	req := api.UpdateContentRequest{Fields: fields, Body: doc.Body, Version: doc.Meta.Version}
	if opts.json {
		raw, err := sess.RawPut(api.ContentPath(collection, slug), req)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.UpdateContent(collection, slug, req)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Updated %s/%s: %s\n", result.Collection, result.Slug, field)
	return err
}

func newContentDeleteCmd(opts *rootOptions) *cobra.Command {
	var force bool
	del := &cobra.Command{
		Use:          "delete <collection> <slug>",
		Short:        "Delete a content document",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentDelete(cmd, opts, args[0], args[1], force)
		},
	}
	del.Flags().BoolVar(&force, "force", false, "delete without asking for confirmation")
	return del
}

// runContentDelete issues DELETE /api/content/:collection/:slug after an
// interactive confirmation (skipped by --force) and prints a confirmation
// or, with --json, the raw response. delete-content.ts refuses a document
// other content references with a 409 — that error surfaces as-is.
func runContentDelete(cmd *cobra.Command, opts *rootOptions, collection, slug string, force bool) error {
	if !force {
		confirmed, err := confirm(cmd, fmt.Sprintf("Delete %s/%s? [y/N] ", collection, slug))
		if err != nil {
			return err
		}
		if !confirmed {
			return errors.New("delete aborted")
		}
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawDelete(api.ContentPath(collection, slug))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.DeleteContent(collection, slug)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Deleted %s/%s\n", result.Collection, result.Slug)
	return err
}

// confirm prints a destructive command's prompt on stderr — the prompt is
// dialogue, not data, so --json stdout stays machine-clean — and reads one
// line from the command's stdin. Only y/Y confirms; anything else,
// including EOF, declines.
func confirm(cmd *cobra.Command, prompt string) (bool, error) {
	if _, err := fmt.Fprint(cmd.ErrOrStderr(), prompt); err != nil {
		return false, err
	}
	line, err := bufio.NewReader(cmd.InOrStdin()).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return false, err
	}
	answer := strings.TrimSpace(line)
	return answer == "y" || answer == "Y", nil
}

func newContentPublishCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "publish <collection> <slug>",
		Short:        "Set a content document's status to published",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentStatus(cmd, opts, args[0], args[1], "published")
		},
	}
}

func newContentUnpublishCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "unpublish <collection> <slug>",
		Short:        "Set a content document's status back to draft",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runContentStatus(cmd, opts, args[0], args[1], "draft")
		},
	}
}

// runContentStatus posts {"status": ...} to
// POST /api/content/:collection/:slug/publish — publish-content.ts's
// explicit-status path, shared by publish ("published") and unpublish
// ("draft"). The endpoint's body-less toggle path is deliberately unused:
// both commands must be idempotent, not state-dependent. Prints a
// confirmation or, with --json, the raw response.
func runContentStatus(cmd *cobra.Command, opts *rootOptions, collection, slug, status string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawPost(api.ContentPublishPath(collection, slug), api.SetStatusRequest{Status: status})
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.SetContentStatus(collection, slug, status)
	if err != nil {
		return err
	}
	verb := "Unpublished"
	if status == "published" {
		verb = "Published"
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "%s %s/%s\n", verb, result.Collection, result.Slug)
	return err
}

// parseFieldFlags parses repeatable --field key=value pairs into the fields
// map create-content.ts validates against the collection's merged schema.
// Values stay strings — the server-side schema is the arbiter of types, not
// the CLI.
func parseFieldFlags(pairs []string) (map[string]any, error) {
	fields := make(map[string]any, len(pairs))
	for _, pair := range pairs {
		key, value, ok := strings.Cut(pair, "=")
		if !ok || key == "" {
			return nil, fmt.Errorf("invalid --field %q: expected key=value", pair)
		}
		fields[key] = value
	}
	return fields, nil
}

// readBodySource loads the markdown body: "" means no body, "-" reads
// stdin, anything else names a file.
func readBodySource(stdin io.Reader, path string) (string, error) {
	switch path {
	case "":
		return "", nil
	case "-":
		data, err := io.ReadAll(stdin)
		if err != nil {
			return "", err
		}
		return string(data), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
