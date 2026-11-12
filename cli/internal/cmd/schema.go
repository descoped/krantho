package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// newSchemaCmd groups the schema commands.
func newSchemaCmd(opts *rootOptions) *cobra.Command {
	schema := &cobra.Command{
		Use:   "schema",
		Short: "Inspect and extend collection schemas via the API",
	}
	schema.AddCommand(
		newSchemaListCmd(opts), newSchemaShowCmd(opts), newSchemaExportCmd(opts),
		newSchemaAddFieldCmd(opts), newSchemaRemoveFieldCmd(opts),
	)
	return schema
}

func newSchemaListCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "list",
		Short:        "List every collection with its field counts by origin",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSchemaList(cmd, opts)
		},
	}
}

// runSchemaList fetches the collection roster (GET /api/collections) and
// each collection's merged schema (GET /api/schema/:collection), rendering
// a table of field counts by origin. The merged schemas are the counting
// source because GET /api/site-config's fieldCount sees only the
// code-defined Zod shape, never runtime fields. --json emits the raw
// responses combined verbatim.
func runSchemaList(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		return writeSchemaListJSON(cmd, sess)
	}
	roster, err := sess.ListCollections()
	if err != nil {
		return err
	}
	rows := make([][]string, 0, len(roster.Collections))
	for _, col := range roster.Collections {
		schema, err := sess.GetSchema(col.Name)
		if err != nil {
			return err
		}
		code, runtime := 0, 0
		for _, field := range schema.Fields {
			if field.Runtime {
				runtime++
			} else {
				code++
			}
		}
		rows = append(rows, []string{
			col.Name, col.Source, strconv.Itoa(code), strconv.Itoa(runtime),
		})
	}
	return output.Table(cmd.OutOrStdout(), []string{"NAME", "SOURCE", "CODE", "RUNTIME"}, rows)
}

// writeSchemaListJSON emits the raw roster and per-collection schema
// responses combined under stable keys — each value verbatim as the
// server sent it, mirroring how info combines its raw responses.
func writeSchemaListJSON(cmd *cobra.Command, sess *session) error {
	collectionsRaw, err := sess.Raw(api.CollectionsPath)
	if err != nil {
		return err
	}
	var roster api.CollectionList
	if err := json.Unmarshal(collectionsRaw, &roster); err != nil {
		return err
	}
	schemas := make(map[string]json.RawMessage, len(roster.Collections))
	for _, col := range roster.Collections {
		raw, err := sess.Raw(api.SchemaPath(col.Name))
		if err != nil {
			return err
		}
		schemas[col.Name] = raw
	}
	combined, err := json.Marshal(map[string]any{
		"collections": collectionsRaw,
		"schemas":     schemas,
	})
	if err != nil {
		return err
	}
	return output.RawJSON(cmd.OutOrStdout(), combined)
}

func newSchemaShowCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "show <collection>",
		Short:        "Show a collection's fields with their origin (code or runtime)",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSchemaShow(cmd, opts, args[0])
		},
	}
}

// runSchemaShow fetches GET /api/schema/:collection and renders the merged
// field table — code-defined Zod fields plus runtime extensions, in wire
// order, each marked with its origin — or, with --json, the raw response.
func runSchemaShow(cmd *cobra.Command, opts *rootOptions, collection string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.Raw(api.SchemaPath(collection))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	schema, err := sess.GetSchema(collection)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	fmt.Fprintf(out, "Collection: %s (%s)\n\n", schema.Name, schema.Source)
	rows := make([][]string, 0, len(schema.Fields))
	for _, field := range schema.Fields {
		rows = append(rows, []string{
			field.Name, fieldType(field), requiredMark(field.Required),
			fieldOrigin(field), field.Description,
		})
	}
	return output.Table(out, []string{"NAME", "TYPE", "REQUIRED", "ORIGIN", "DESCRIPTION"}, rows)
}

// fieldType renders the TYPE cell: an enum's values, a formatted string's
// format ("string (uri)"), or the plain JSON Schema type.
func fieldType(field api.SchemaField) string {
	if len(field.Enum) > 0 {
		return "enum(" + strings.Join(field.Enum, ", ") + ")"
	}
	if field.Format != "" {
		return field.Type + " (" + field.Format + ")"
	}
	return field.Type
}

// requiredMark renders the REQUIRED cell.
func requiredMark(required bool) string {
	if required {
		return "yes"
	}
	return "no"
}

// fieldOrigin names where a field is defined: "runtime" for a database
// extension, "code" for a Zod schema field.
func fieldOrigin(field api.SchemaField) string {
	if field.Runtime {
		return "runtime"
	}
	return "code"
}

func newSchemaExportCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "export <collection>",
		Short:        "Export a collection's merged schema as Zod source",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSchemaExport(cmd, opts, args[0])
		},
	}
}

// runSchemaExport fetches GET /api/schema/:collection/export — the
// { collection, code } envelope of export-schema.ts, code being the
// exportSchemaAsZod-generated defineCollection source with the runtime
// fields folded in — and writes the source verbatim to stdout, terminated
// with a newline when the source lacks one so `> schema.ts` redirection
// yields a proper text file. --json emits the raw envelope instead.
func runSchemaExport(cmd *cobra.Command, opts *rootOptions, collection string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.Raw(api.SchemaExportPath(collection))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	export, err := sess.ExportSchema(collection)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	if _, err := io.WriteString(out, export.Code); err != nil {
		return err
	}
	if strings.HasSuffix(export.Code, "\n") {
		return nil
	}
	_, err = io.WriteString(out, "\n")
	return err
}

func newSchemaAddFieldCmd(opts *rootOptions) *cobra.Command {
	var description, values string
	var required bool
	add := &cobra.Command{
		Use:          "add-field <collection> <name> <type>",
		Short:        "Add or update a runtime field on a collection",
		Args:         cobra.ExactArgs(3),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			req, err := buildSaveFieldRequest(
				args[1], args[2], description, required,
				values, cmd.Flags().Changed("values"),
			)
			if err != nil {
				return err
			}
			return runSchemaAddField(cmd, opts, args[0], req)
		},
	}
	add.Flags().StringVar(&description, "description", "", "field description shown in Studio")
	add.Flags().BoolVar(&required, "required", false, "mark the field as required")
	add.Flags().StringVar(&values, "values", "", "comma-separated allowed values (enum type only)")
	return add
}

// buildSaveFieldRequest validates the field type and --values usage
// client-side — the same rules save-runtime-field.ts enforces — so a bad
// invocation fails before any request is made.
func buildSaveFieldRequest(name, fieldType, description string, required bool, values string, valuesSet bool) (api.SaveRuntimeFieldRequest, error) {
	var zero api.SaveRuntimeFieldRequest
	if !slices.Contains(api.RuntimeFieldTypes, fieldType) {
		return zero, fmt.Errorf("invalid field type %q: must be one of %s",
			fieldType, strings.Join(api.RuntimeFieldTypes, ", "))
	}
	if valuesSet && fieldType != "enum" {
		return zero, fmt.Errorf("--values only applies to enum fields, not type %q", fieldType)
	}
	req := api.SaveRuntimeFieldRequest{
		Name: name, Type: fieldType, Required: required, Description: description,
	}
	if valuesSet {
		enumValues, err := parseEnumValues(values)
		if err != nil {
			return zero, err
		}
		req.EnumValues = enumValues
	}
	return req, nil
}

// parseEnumValues splits the comma-separated --values list, trimming
// whitespace around each value and rejecting empty entries.
func parseEnumValues(values string) ([]string, error) {
	parts := strings.Split(values, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			return nil, fmt.Errorf("invalid --values %q: empty value", values)
		}
		out = append(out, value)
	}
	return out, nil
}

// runSchemaAddField PUTs the field definition to
// PUT /api/schema/:collection/fields — save-runtime-field.ts's upsert, which
// normalizes the definition into the collection's runtime schema — and
// prints a confirmation with the saved field or, with --json, the raw
// response. A name a code-defined Zod field owns is the handler's 409; that
// error surfaces as-is.
func runSchemaAddField(cmd *cobra.Command, opts *rootOptions, collection string, req api.SaveRuntimeFieldRequest) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawPut(api.SchemaFieldsPath(collection), req)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.SaveRuntimeField(collection, req)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Saved field %s (%s) in %s\n",
		result.Field.Name, savedFieldType(result.Field), collection)
	return err
}

// savedFieldType renders the saved field's type — an enum's values, else
// the plain type — the way show's TYPE cell renders it.
func savedFieldType(field api.SavedRuntimeField) string {
	if len(field.EnumValues) > 0 {
		return "enum(" + strings.Join(field.EnumValues, ", ") + ")"
	}
	return field.Type
}

func newSchemaRemoveFieldCmd(opts *rootOptions) *cobra.Command {
	var force bool
	remove := &cobra.Command{
		Use:          "remove-field <collection> <name>",
		Short:        "Remove a runtime field from a collection",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSchemaRemoveField(cmd, opts, args[0], args[1], force)
		},
	}
	remove.Flags().BoolVar(&force, "force", false, "remove without asking for confirmation")
	return remove
}

// runSchemaRemoveField issues DELETE /api/schema/:collection/fields/:field
// after an interactive confirmation (skipped by --force) and prints a
// confirmation or, with --json, the raw response. delete-runtime-field.ts
// refuses a code-defined field with a 409 and answers 404 for a field no
// runtime schema defines — both surface as-is.
func runSchemaRemoveField(cmd *cobra.Command, opts *rootOptions, collection, field string, force bool) error {
	if !force {
		confirmed, err := confirm(cmd, fmt.Sprintf("Remove field %s from %s? [y/N] ", field, collection))
		if err != nil {
			return err
		}
		if !confirmed {
			return errors.New("remove aborted")
		}
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawDelete(api.SchemaFieldPath(collection, field))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.DeleteRuntimeField(collection, field)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Removed field %s from %s\n", result.Field, collection)
	return err
}
