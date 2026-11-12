package cmd

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// newExportCmd builds the root-level export command: a collection export
// (JSON envelope to stdout, or --out markdown files) or a full-site bundle
// (--bundle). The import counterpart lives in transfer_import.go.
func newExportCmd(opts *rootOptions) *cobra.Command {
	var outDir, locale, bundle, state string
	export := &cobra.Command{
		Use:          "export [collection]",
		Short:        "Export a collection or a full-site bundle via the API",
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if state != "current" && state != "published" {
				return errors.New("--state must be current or published")
			}
			if err := validateExportInvocation(opts.json, args, bundle, outDir, locale); err != nil {
				return err
			}
			if bundle != "" {
				return runExportBundle(cmd, opts, bundle, state)
			}
			if outDir != "" {
				return runExportMarkdown(cmd, opts, args[0], locale, outDir, state)
			}
			return runExportJSON(cmd, opts, args[0], locale, state)
		},
	}
	export.Flags().StringVar(&outDir, "out", "",
		"write one markdown file per document into this directory")
	export.Flags().StringVar(&state, "state", "current", "export current drafts or published snapshots")
	export.Flags().StringVar(&locale, "locale", "", "filter by locale (e.g. en)")
	export.Flags().StringVar(&bundle, "bundle", "",
		"export the full site as a JSON bundle to this file (- for stdout)")
	return export
}

// validateExportInvocation rejects argument/flag combinations with no
// meaning before any request is made.
func validateExportInvocation(jsonFlag bool, args []string, bundle, outDir, locale string) error {
	if bundle != "" {
		if len(args) > 0 {
			return errors.New("--bundle exports the whole site — drop the collection argument")
		}
		if outDir != "" || locale != "" {
			return errors.New("--out and --locale apply to a collection export, not --bundle")
		}
		if jsonFlag && bundle != "-" {
			return errors.New("--json writes the bundle to stdout — use --bundle - instead of a file")
		}
		return nil
	}
	if len(args) == 0 {
		return errors.New("export needs a collection argument (or --bundle <file>)")
	}
	if jsonFlag && outDir != "" {
		return errors.New("--json and --out cannot be combined — a collection export already prints JSON")
	}
	return nil
}

// runExportJSON fetches GET /api/content/:collection/export?format=json and
// prints the raw envelope — an export is machine data, so the default
// rendering IS the verbatim JSON (--json changes nothing here).
func runExportJSON(cmd *cobra.Command, opts *rootOptions, collection, locale, state string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	raw, err := sess.Raw(api.ExportContentPath(collection, "json", locale, state))
	if err != nil {
		return err
	}
	return output.RawJSON(cmd.OutOrStdout(), raw)
}

// runExportMarkdown fetches the markdown-format export and writes each
// file's server-built content — export-content.ts renders the `---` fenced
// frontmatter with JSON-encoded (YAML-safe) values itself — verbatim to
// <dir>/<slug>.md.
func runExportMarkdown(cmd *cobra.Command, opts *rootOptions, collection, locale, dir, state string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	export, err := sess.ExportContentMarkdown(collection, locale, state)
	if err != nil {
		return err
	}
	names := map[string]bool{}
	for _, file := range export.Files {
		name, err := markdownFilename(file.Slug)
		if err != nil {
			return err
		}
		if names[name] {
			return errors.New("markdown filenames collide; export one locale at a time with --locale")
		}
		names[name] = true
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, file := range export.Files {
		name, err := markdownFilename(file.Slug)
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte(file.Content), 0o644); err != nil {
			return err
		}
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Exported %d documents from %s to %s\n",
		len(export.Files), collection, dir)
	return err
}

// markdownFilename maps a slug to its export filename, refusing anything
// that would escape the output directory — slugs arrive from the server
// and are written locally, so path separators and dot-segments are
// rejected rather than trusted.
func markdownFilename(slug string) (string, error) {
	if slug == "" || slug == "." || slug == ".." || strings.ContainsAny(slug, `/\`) {
		return "", fmt.Errorf("slug %q is not a safe filename", slug)
	}
	return slug + ".md", nil
}

// runExportBundle fetches GET /api/export/bundle and writes the raw bundle
// — verbatim JSON, indented — to the file ("-" streams it to stdout). The
// summary decodes only the version and content counts; the bundle itself
// is never reshaped.
func runExportBundle(cmd *cobra.Command, opts *rootOptions, file, state string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	raw, err := sess.Raw(api.BundleExportPath + "?state=" + state)
	if err != nil {
		return err
	}
	if file == "-" {
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	var buf bytes.Buffer
	if err := output.RawJSON(&buf, raw); err != nil {
		return err
	}
	if err := os.WriteFile(file, buf.Bytes(), 0o644); err != nil {
		return err
	}
	var summary api.BundleSummary
	if err := json.Unmarshal(raw, &summary); err != nil {
		return err
	}
	documents := 0
	for _, items := range summary.Content {
		documents += len(items)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(),
		"Exported bundle version %d (%d collections, %d documents) to %s\n",
		summary.Version, len(summary.Content), documents, file)
	return err
}
