package cmd

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestSchemaFieldOps(t *testing.T) {
	t.Run("add-field puts the definition body and confirms the saved field", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "add-field", "pages", "badge", "string",
			"--description", "Badge label", "--api-url", srv.URL)

		if fake.saveFieldCalls != 1 {
			t.Errorf("save calls = %d, want 1", fake.saveFieldCalls)
		}
		want := map[string]any{
			"name":        "badge",
			"type":        "string",
			"required":    false,
			"description": "Badge label",
		}
		if !reflect.DeepEqual(fake.lastSaveBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastSaveBody, want)
		}
		if wantOut := "Saved field badge (string) in pages\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("add-field --values sends trimmed enumValues for an enum", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "add-field", "pages", "tier", "enum",
			"--values", "gold, silver,bronze", "--required", "--api-url", srv.URL)

		want := map[string]any{
			"name":       "tier",
			"type":       "enum",
			"required":   true,
			"enumValues": []any{"gold", "silver", "bronze"},
		}
		if !reflect.DeepEqual(fake.lastSaveBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastSaveBody, want)
		}
		if wantOut := "Saved field tier (enum(gold, silver, bronze)) in pages\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("invalid field type is rejected client-side before any request", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "add-field", "pages", "badge", "integer",
			"--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for invalid type, got success\noutput:\n%s", out)
		}
		// The error must name every valid type — the save-runtime-field.ts
		// VALID_FIELD_TYPES set — so the user can correct the invocation.
		want := "string, number, boolean, date, enum, url, email, textarea, color, reference"
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to list the valid types %q", err.Error(), want)
		}
		if fake.saveFieldCalls != 0 {
			t.Errorf("save calls = %d, want 0 (client-side validation must reject first)", fake.saveFieldCalls)
		}
	})

	t.Run("--values on a non-enum type is rejected client-side before any request", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "add-field", "pages", "badge", "string",
			"--values", "a,b", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for --values on a string field, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "enum") {
			t.Errorf("error = %q, want it to explain --values is enum-only", err.Error())
		}
		if fake.saveFieldCalls != 0 {
			t.Errorf("save calls = %d, want 0 (client-side validation must reject first)", fake.saveFieldCalls)
		}
	})

	t.Run("add-field --json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startSchemaServer(t)

		out := runCLI(t, credsPath, "schema", "add-field", "pages", "badge", "string",
			"--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"message": "Field saved",
			"field":   map[string]any{"name": "badge", "type": "string", "required": false},
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("remove-field asks for confirmation and y confirms", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLIWithStdin(t, credsPath, "y\n",
			"schema", "remove-field", "pages", "hero-image", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("confirmed remove: %v\noutput:\n%s", err, out)
		}
		if fake.deleteFieldCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteFieldCalls)
		}
		if fake.lastDeletedField != "hero-image" {
			t.Errorf("deleted field = %q, want %q", fake.lastDeletedField, "hero-image")
		}
		if want := "Remove field hero-image from pages? [y/N] "; !strings.Contains(out, want) {
			t.Errorf("output does not show the confirmation prompt %q\noutput:\n%s", want, out)
		}
		if want := "Removed field hero-image from pages\n"; !strings.Contains(out, want) {
			t.Errorf("output does not confirm the removal with %q\noutput:\n%s", want, out)
		}
	})

	t.Run("remove-field declined with n sends no request and exits non-zero", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLIWithStdin(t, credsPath, "n\n",
			"schema", "remove-field", "pages", "hero-image", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected declined remove to error, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "remove aborted") {
			t.Errorf("error = %q, want it to mention the abort", err.Error())
		}
		if fake.deleteFieldCalls != 0 {
			t.Errorf("delete calls = %d, want 0 (declined confirmation must not touch the API)", fake.deleteFieldCalls)
		}
	})

	t.Run("remove-field --force skips the prompt without reading stdin", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		// A pending "n" on stdin proves --force: were the prompt consulted,
		// this answer would decline the removal.
		out, err := execCLIWithStdin(t, credsPath, "n\n",
			"schema", "remove-field", "pages", "hero-image", "--force", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("forced remove: %v\noutput:\n%s", err, out)
		}
		if fake.deleteFieldCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteFieldCalls)
		}
		if strings.Contains(out, "[y/N]") {
			t.Errorf("--force still printed a confirmation prompt\noutput:\n%s", out)
		}
	})

	t.Run("adding over a code-defined field surfaces the 409 and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "add-field", "pages", "title", "string",
			"--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for code-defined field, got success\noutput:\n%s", out)
		}
		if fake.saveFieldCalls != 1 {
			t.Errorf("save calls = %d, want 1", fake.saveFieldCalls)
		}
		want := `Field "title" is defined in code and cannot be overridden`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})

	t.Run("removing a code-defined field surfaces the 409 and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "remove-field", "pages", "title",
			"--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for code-defined field, got success\noutput:\n%s", out)
		}
		if fake.deleteFieldCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteFieldCalls)
		}
		want := `Field "title" is defined in code and cannot be deleted`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})

	t.Run("removing an unknown runtime field surfaces the 404 and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startSchemaServer(t)

		out, err := execCLI(t, credsPath, "schema", "remove-field", "pages", "sidebar",
			"--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for unknown runtime field, got success\noutput:\n%s", out)
		}
		if fake.deleteFieldCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteFieldCalls)
		}
		want := `Runtime field "sidebar" not found`
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})
}
