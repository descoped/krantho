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

// newImportCmd builds the root-level import command: a collection import
// from a JSON export file or a directory of markdown files, or a full-site
// bundle import (--bundle). The export counterpart lives in transfer.go.
func newImportCmd(opts *rootOptions) *cobra.Command {
	var dir, bundle string
	imp := &cobra.Command{
		Use:          "import [collection] [file]",
		Short:        "Import documents or a full-site bundle via the API",
		Args:         cobra.MaximumNArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validateImportInvocation(args, dir, bundle); err != nil {
				return err
			}
			if bundle != "" {
				return runImportBundle(cmd, opts, bundle)
			}
			if dir != "" {
				return runImportDir(cmd, opts, args[0], dir)
			}
			return runImportFile(cmd, opts, args[0], args[1])
		},
	}
	imp.Flags().StringVar(&dir, "dir", "",
		"import every .md file (frontmatter + body) in this directory")
	imp.Flags().StringVar(&bundle, "bundle", "", "import a full-site JSON bundle from this file")
	return imp
}

// validateImportInvocation rejects argument/flag combinations with no
// meaning before any file is read or request made.
func validateImportInvocation(args []string, dir, bundle string) error {
	if bundle != "" {
		if len(args) > 0 || dir != "" {
			return errors.New("--bundle imports the whole site — drop the collection/file arguments and --dir")
		}
		return nil
	}
	if dir != "" {
		if len(args) != 1 {
			return errors.New("--dir needs exactly a collection: krantho import <collection> --dir <path>")
		}
		return nil
	}
	if len(args) != 2 {
		return errors.New("import needs a collection and a JSON file (or --dir <path>, or --bundle <file>)")
	}
	return nil
}

// runImportFile reads a JSON export file and posts it as the
// import-content.ts bulk request.
func runImportFile(cmd *cobra.Command, opts *rootOptions, collection, file string) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	items, err := decodeImportItems(data)
	if err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	return postImport(cmd, opts, collection, items)
}

// decodeImportItems accepts the two JSON shapes an export produces — the
// { items: [...] } envelope of export-content.ts format=json and a bare
// array — and lifts each document's slug/locale from its meta block when
// they are not top-level, so an export round-trips into an import without
// editing: import-content.ts reads slug at the top level only.
func decodeImportItems(data []byte) ([]api.ImportItem, error) {
	trimmed := bytes.TrimSpace(data)
	var rawItems []json.RawMessage
	if bytes.HasPrefix(trimmed, []byte("[")) {
		if err := json.Unmarshal(trimmed, &rawItems); err != nil {
			return nil, err
		}
	} else {
		var envelope struct {
			Items []json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(trimmed, &envelope); err != nil {
			return nil, err
		}
		rawItems = envelope.Items
	}
	if len(rawItems) == 0 {
		return nil, errors.New(`no documents found — expected an "items" array or a bare JSON array`)
	}
	items := make([]api.ImportItem, 0, len(rawItems))
	for i, raw := range rawItems {
		item, err := decodeImportItem(raw)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", i, err)
		}
		items = append(items, item)
	}
	return items, nil
}

// decodeImportItem decodes one exported document into the import request
// shape, preserving identity, contract, metadata, defaults and basis.
func decodeImportItem(raw json.RawMessage) (api.ImportItem, error) {
	var item api.ImportItem
	if err := json.Unmarshal(raw, &item); err != nil {
		return item, err
	}
	if item.Identity.Collection == "" || item.Identity.Slug == "" || item.Identity.Locale == "" {
		return item, errors.New("document needs identity.collection, identity.slug and identity.locale")
	}
	if item.Fields == nil || item.Metadata == nil || item.Defaults == nil {
		return item, errors.New("document needs fields, metadata and defaults")
	}
	return item, nil
}

// runImportDir imports exported portable Markdown files, using their exact
// document identity, authored values and body, as one reviewed bulk request.
func runImportDir(cmd *cobra.Command, opts *rootOptions, collection, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var items []api.ImportItem
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		fields, body, err := parseMarkdownDocument(data)
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		envelope := map[string]any{"fields": map[string]any{}, "body": body, "metadata": map[string]any{}, "defaults": []any{}}
		for key, value := range fields {
			switch key {
			case "identity", "contract", "metadata", "defaults", "basis":
				envelope[key] = value
			case "status", "locale":
			default:
				envelope["fields"].(map[string]any)[key] = value
			}
		}

		raw, err := json.Marshal(envelope)
		if err != nil {
			return err
		}
		item, err := decodeImportItem(raw)
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		items = append(items, item)
	}
	if len(items) == 0 {
		return fmt.Errorf("no .md files in %s", dir)
	}
	return postImport(cmd, opts, collection, items)
}

// postImport sends the bulk request and renders the import-content.ts
// result: a summary line, one line per failed document, and a non-zero
// exit when anything failed — per-item failures travel in results, never
// in the HTTP status. --json emits the raw response instead.
func postImport(cmd *cobra.Command, opts *rootOptions, collection string, items []api.ImportItem) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	req := api.ImportContentRequest{Items: items}
	if opts.json {
		raw, err := sess.RawPost(api.ImportContentPath(collection), req)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.ImportContent(collection, req)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	fmt.Fprintf(out, "Imported %d/%d documents into %s\n", result.Imported, result.Total, collection)
	failed := 0
	for _, item := range result.Results {
		if item.Imported || item.Unchanged {
			continue
		}
		failed++
		fmt.Fprintf(out, "  failed %s: %s\n", item.Slug, item.Error)
	}
	if failed > 0 {
		return fmt.Errorf("%d of %d documents failed to import", failed, result.Total)
	}
	return nil
}

// runImportBundle posts a bundle file verbatim to POST /api/import/bundle
// and renders the import-bundle.ts result: imported/skipped counts, the
// checkpoint state, one line per failed document, and a non-zero exit when
// anything failed. --json emits the raw response instead.
func runImportBundle(cmd *cobra.Command, opts *rootOptions, file string) error {
	data, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	if !json.Valid(data) {
		return fmt.Errorf("%s is not valid JSON", file)
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawPost(api.BundleImportPath, json.RawMessage(data))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.ImportBundle(data)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	fmt.Fprintf(out, "Imported %d documents, skipped %d unchanged (checkpoint %s)\n",
		result.Imported, result.Skipped, result.Checkpoint)
	for _, failure := range result.Errors {
		fmt.Fprintf(out, "  failed %s/%s: %s\n", failure.Collection, failure.Slug, failure.Error)
	}
	if len(result.Errors) > 0 {
		return fmt.Errorf("%d documents failed to import", len(result.Errors))
	}
	return nil
}

// parseMarkdownDocument parses the markdown file shape krantho's exports
// emit — a `---` fenced frontmatter block of `key: value` lines followed
// by the body. It is deliberately minimal, the exact inverse of what the
// writers produce (output.MarkdownDocument and export-content.ts
// format=markdown): each value is tried as JSON first — both writers
// JSON-encode everything that is not a plain scalar — and kept as the
// literal string otherwise.
func parseMarkdownDocument(data []byte) (map[string]any, string, error) {
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	rest, found := strings.CutPrefix(text, "---\n")
	if !found {
		return nil, "", errors.New(`missing opening "---" frontmatter fence`)
	}
	var block, body string
	if after, empty := strings.CutPrefix(rest, "---\n"); empty {
		block, body = "", after
	} else if b, a, closed := strings.Cut(rest, "\n---\n"); closed {
		block, body = b, a
	} else {
		return nil, "", errors.New(`missing closing "---" frontmatter fence`)
	}
	// One parser serves two writers: hand-authored files conventionally put a
	// blank line after the closing fence, while export-content.ts emits none.
	// Stripping at most one newline favors the hand-authored convention; the
	// known cost is that a stored body BEGINNING with a blank line loses it
	// on an export -> import --dir round trip (asserted by
	// TestImportCollection's leading-blank-line subtest).

	fields := map[string]any{}
	if block == "" {
		return fields, body, nil
	}
	for i, line := range strings.Split(block, "\n") {
		key, value, isPair := strings.Cut(line, ":")
		if !isPair || key == "" {
			return nil, "", fmt.Errorf("frontmatter line %d is not a %q pair: %q", i+1, "key: value", line)
		}
		var decodedKey string
		if json.Unmarshal([]byte(key), &decodedKey) == nil {
			key = decodedKey
		}
		fields[key] = frontmatterFieldValue(strings.TrimSpace(value))
	}
	return fields, body, nil
}

// frontmatterFieldValue is the inverse of output's frontmatterValue: a
// value that parses as JSON was JSON-encoded by the writer (quoted
// strings, numbers, booleans, null, flow collections); anything else was
// emitted as a plain YAML scalar and stays a string.
func frontmatterFieldValue(raw string) any {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err == nil {
		return value
	}
	return raw
}
