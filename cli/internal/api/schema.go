package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
)

// SchemaPath returns the API path of a collection's merged field schema.
func SchemaPath(collection string) string {
	return "/api/schema/" + url.PathEscape(collection)
}

// SchemaFieldsPath returns the API path of a collection's runtime-field
// endpoint — PUT upserts a field, whose name travels in the body.
func SchemaFieldsPath(collection string) string {
	return SchemaPath(collection) + "/fields"
}

// SchemaExportPath returns the API path of a collection's Zod source export.
func SchemaExportPath(collection string) string {
	return SchemaPath(collection) + "/export"
}

// SchemaFieldPath returns the API path of one runtime field, the DELETE
// target.
func SchemaFieldPath(collection, field string) string {
	return SchemaFieldsPath(collection) + "/" + url.PathEscape(field)
}

// RuntimeFieldTypes are the valid runtime field types —
// save-runtime-field.ts's VALID_FIELD_TYPES, everything outside of which its
// 400 rejects.
var RuntimeFieldTypes = []string{
	"string", "number", "boolean", "date", "enum",
	"url", "email", "textarea", "color", "reference",
}

// SchemaField is one property of the merged JSON Schema that
// GET /api/schema/:collection returns (get-schema.ts): a code-defined Zod
// field converted by collectionToJsonSchema, or a runtime extension the
// handler merges in with its `_runtime: true` marker. Requiredness lives
// in the schema-level required array for both origins — the handler
// appends required runtime fields to it.
type SchemaField struct {
	Name string
	// Type is the JSON Schema type keyword — "string", "number", or
	// "boolean" for every field either generator emits. A nullable code
	// field compiles to an anyOf union without a type keyword, which
	// leaves Type empty.
	Type string
	// Enum carries an enum field's allowed values. Both generators emit
	// string members only (z.enum and RuntimeFieldDefinition.enumValues).
	Enum []string
	// Format is set for runtime url ("uri") and email ("email") fields.
	Format string
	// Description is the property description when one is declared.
	Description string
	Required    bool
	// Runtime reports the field's origin: true for a runtime extension
	// (the `_runtime: true` marker), false for a code-defined Zod field.
	Runtime bool
}

// CollectionSchema is the decoded GET /api/schema/:collection response:
// { name, source, schema } (collectionToJsonSchema in schema-export.ts)
// with the JSON Schema properties flattened into fields. Field order is
// the wire order — code fields in schema declaration order with runtime
// fields appended, because get-schema.ts spreads the code properties
// first and adds runtime fields after.
type CollectionSchema struct {
	Name   string
	Source string
	Fields []SchemaField
}

// schemaProperty is the wire shape of one JSON Schema property. Keys the
// generators also emit but the CLI does not render (default, minimum,
// maxLength, pattern, ...) are ignored here; --json output preserves them
// via the session's raw path.
type schemaProperty struct {
	Type        string   `json:"type"`
	Enum        []string `json:"enum"`
	Format      string   `json:"format"`
	Description string   `json:"description"`
	Runtime     bool     `json:"_runtime"`
}

// GetSchema fetches a collection's merged field schema via
// GET /api/schema/:collection. An unknown collection is the validator's
// 404 `Collection "<name>" not found`.
func (c *Client) GetSchema(collection string) (*CollectionSchema, error) {
	var resp struct {
		Name   string `json:"name"`
		Source string `json:"source"`
		Schema struct {
			Properties json.RawMessage `json:"properties"`
			Required   []string        `json:"required"`
		} `json:"schema"`
	}
	if err := c.Get(SchemaPath(collection), &resp); err != nil {
		return nil, err
	}
	fields, err := decodeSchemaFields(resp.Schema.Properties, resp.Schema.Required)
	if err != nil {
		return nil, fmt.Errorf("schema %q: %w", collection, err)
	}
	return &CollectionSchema{Name: resp.Name, Source: resp.Source, Fields: fields}, nil
}

// decodeSchemaFields walks the properties object with a token decoder so
// the wire order survives — decoding into a Go map would scramble the
// declaration order the server emits.
func decodeSchemaFields(properties json.RawMessage, required []string) ([]SchemaField, error) {
	if len(properties) == 0 {
		return nil, nil
	}
	requiredSet := make(map[string]bool, len(required))
	for _, name := range required {
		requiredSet[name] = true
	}
	dec := json.NewDecoder(bytes.NewReader(properties))
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if tok != json.Delim('{') {
		return nil, fmt.Errorf("properties is not a JSON object")
	}
	var fields []SchemaField
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		name, ok := tok.(string)
		if !ok {
			return nil, fmt.Errorf("unexpected token %v in properties", tok)
		}
		var prop schemaProperty
		if err := dec.Decode(&prop); err != nil {
			return nil, fmt.Errorf("property %q: %w", name, err)
		}
		fields = append(fields, SchemaField{
			Name:        name,
			Type:        prop.Type,
			Enum:        prop.Enum,
			Format:      prop.Format,
			Description: prop.Description,
			Required:    requiredSet[name],
			Runtime:     prop.Runtime,
		})
	}
	return fields, nil
}

// SchemaExport is the decoded GET /api/schema/:collection/export response —
// export-schema.ts's JSON envelope { collection, code }, where code is the
// exportSchemaAsZod-generated defineCollection source: the merged schema
// (code-defined Zod fields plus runtime extensions) as newline-joined
// TypeScript with no trailing newline.
type SchemaExport struct {
	Collection string `json:"collection"`
	Code       string `json:"code"`
}

// ExportSchema fetches a collection's schema as generated Zod source via
// GET /api/schema/:collection/export. An unknown collection is the
// validator's 404 `Collection "<name>" not found`.
func (c *Client) ExportSchema(collection string) (*SchemaExport, error) {
	var result SchemaExport
	if err := c.Get(SchemaExportPath(collection), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// SaveRuntimeFieldRequest is the PUT /api/schema/:collection/fields request
// body — the RuntimeFieldDefinition keys the CLI exposes.
// save-runtime-field.ts reads name (required), type (required, one of
// RuntimeFieldTypes), required (counts only as JSON true), description
// (strings only), and enumValues (a string array). The definition's remaining
// keys (default, refCollection, min, max, pattern) have no CLI flag and are
// omitted.
type SaveRuntimeFieldRequest struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Description string   `json:"description,omitempty"`
	EnumValues  []string `json:"enumValues,omitempty"`
}

// SavedRuntimeField is the normalized RuntimeFieldDefinition that
// save-runtime-field.ts persists and echoes back — optional keys it
// normalized to undefined are absent from the JSON.
type SavedRuntimeField struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Description string   `json:"description"`
	EnumValues  []string `json:"enumValues"`
}

// SaveRuntimeFieldResult is the save-runtime-field.ts 200 response body:
// { message: "Field saved", field: <normalized definition> }.
type SaveRuntimeFieldResult struct {
	Message string            `json:"message"`
	Field   SavedRuntimeField `json:"field"`
}

// SaveRuntimeField adds or updates a runtime field via
// PUT /api/schema/:collection/fields. A name colliding with a code-defined
// Zod field is the handler's 409 `Field "<name>" is defined in code and
// cannot be overridden`; an adapter without runtime schema support is its
// 501.
func (c *Client) SaveRuntimeField(collection string, req SaveRuntimeFieldRequest) (*SaveRuntimeFieldResult, error) {
	var result SaveRuntimeFieldResult
	if err := c.Put(SchemaFieldsPath(collection), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteRuntimeFieldResult is the delete-runtime-field.ts 200 response body:
// { message: "Field deleted", field: "<name>" } — field is the removed
// field's name, not a definition.
type DeleteRuntimeFieldResult struct {
	Message string `json:"message"`
	Field   string `json:"field"`
}

// DeleteRuntimeField removes a runtime field via
// DELETE /api/schema/:collection/fields/:field. A code-defined field is the
// handler's 409 `Field "<name>" is defined in code and cannot be deleted`;
// a field no runtime schema defines is its 404 `Runtime field "<name>" not
// found`.
func (c *Client) DeleteRuntimeField(collection, field string) (*DeleteRuntimeFieldResult, error) {
	var result DeleteRuntimeFieldResult
	if err := c.Delete(SchemaFieldPath(collection, field), &result); err != nil {
		return nil, err
	}
	return &result, nil
}
