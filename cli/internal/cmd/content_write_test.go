package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestContentCreate(t *testing.T) {
	t.Run("posts slug fields body and locale exactly as create-content.ts reads them", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)
		bodyFile := filepath.Join(t.TempDir(), "body.md")
		if err := os.WriteFile(bodyFile, []byte("# Getting Started\n\nHello.\n"), 0o644); err != nil {
			t.Fatalf("write body file: %v", err)
		}

		out := runCLI(t, credsPath, "content", "create", "pages", "getting-started",
			"--field", "title=Getting Started",
			"--field", "description=First steps",
			"--locale", "en",
			"--body", bodyFile,
			"--api-url", srv.URL)

		if fake.createCalls != 1 {
			t.Errorf("create calls = %d, want 1", fake.createCalls)
		}
		want := map[string]any{
			"slug": "getting-started",
			"fields": map[string]any{
				"title":       "Getting Started",
				"description": "First steps",
			},
			"body":   "# Getting Started\n\nHello.\n",
			"locale": "en",
		}
		if !reflect.DeepEqual(fake.lastCreateBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastCreateBody, want)
		}
		if wantOut := "Created pages/getting-started\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("minimal create sends empty fields, empty body, and no locale key", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		runCLI(t, credsPath, "content", "create", "pages", "hello", "--api-url", srv.URL)

		want := map[string]any{"slug": "hello", "fields": map[string]any{}, "body": ""}
		if !reflect.DeepEqual(fake.lastCreateBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastCreateBody, want)
		}
	})

	t.Run("--body - reads the markdown body from stdin", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLIWithStdin(t, credsPath, "# From stdin\n",
			"content", "create", "pages", "hello", "--body", "-", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("create from stdin: %v\noutput:\n%s", err, out)
		}
		if got := fake.lastCreateBody["body"]; got != "# From stdin\n" {
			t.Errorf("body = %#v, want %q", got, "# From stdin\n")
		}
	})

	t.Run("--json emits the raw 201 response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "create", "pages", "hello",
			"--field", "title=Hello", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"slug": "hello", "collection": "pages", "message": "Created",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("server-side validation failure surfaces its message and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLI(t, credsPath, "content", "create", "pages", "invalid", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for rejected create, got success\noutput:\n%s", out)
		}
		if fake.createCalls != 1 {
			t.Errorf("create calls = %d, want 1", fake.createCalls)
		}
		want := "Validation failed"
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})

	t.Run("malformed --field without key=value errors before any request", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLI(t, credsPath, "content", "create", "pages", "hello",
			"--field", "title", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for malformed --field, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "expected key=value") {
			t.Errorf("error = %q, want it to mention key=value", err.Error())
		}
		if fake.createCalls != 0 {
			t.Errorf("create calls = %d, want 0 (client-side validation must reject first)", fake.createCalls)
		}
	})
}

func TestContentSetVersionConflict(t *testing.T) {
	t.Run("puts the read version and the updated field with other fields unchanged", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "set", "pages", "about", "title", "New Title",
			"--api-url", srv.URL)

		if fake.getCalls != 1 {
			t.Errorf("get calls = %d, want 1 (set is read-modify-write)", fake.getCalls)
		}
		if fake.updateCalls != 1 {
			t.Errorf("update calls = %d, want 1", fake.updateCalls)
		}
		want := map[string]any{
			"fields": map[string]any{
				"title":       "New Title",
				"description": "Who we are",
				"status":      "published",
				"featured":    true,
			},
			"body":     "# About\n\nWho we are.",
			"_version": float64(3),
		}
		if !reflect.DeepEqual(fake.lastUpdateBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastUpdateBody, want)
		}
		if wantOut := "Updated pages/about: title\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("concurrent edit surfaces the 409 conflict message and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)
		// A concurrent edit landed after our read: the server's stored
		// version moved past the version the GET fixture hands the CLI.
		fake.storedVersion = 4

		out, err := execCLI(t, credsPath, "content", "set", "pages", "about", "title", "New Title",
			"--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for stale version, got success\noutput:\n%s", out)
		}
		if fake.updateCalls != 1 {
			t.Errorf("update calls = %d, want 1", fake.updateCalls)
		}
		want := "Content has been modified by another user"
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})

	t.Run("--json emits the raw PUT response data", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "set", "pages", "about", "title", "New Title",
			"--json", "--api-url", srv.URL)

		if fake.getCalls != 1 {
			t.Errorf("get calls = %d, want 1 (--json still reads before writing)", fake.getCalls)
		}
		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"slug": "about", "collection": "pages", "message": "Updated",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})
}

func TestContentDeletePublish(t *testing.T) {
	t.Run("delete asks for confirmation and y confirms", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLIWithStdin(t, credsPath, "y\n",
			"content", "delete", "pages", "about", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("confirmed delete: %v\noutput:\n%s", err, out)
		}
		if fake.deleteCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteCalls)
		}
		if want := "Delete pages/about? [y/N] "; !strings.Contains(out, want) {
			t.Errorf("output does not show the confirmation prompt %q\noutput:\n%s", want, out)
		}
		if want := "Deleted pages/about\n"; !strings.Contains(out, want) {
			t.Errorf("output does not confirm the delete with %q\noutput:\n%s", want, out)
		}
	})

	t.Run("delete declined with n sends no request and exits non-zero", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLIWithStdin(t, credsPath, "n\n",
			"content", "delete", "pages", "about", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected declined delete to error, got success\noutput:\n%s", out)
		}
		if !strings.Contains(err.Error(), "delete aborted") {
			t.Errorf("error = %q, want it to mention the abort", err.Error())
		}
		if fake.deleteCalls != 0 {
			t.Errorf("delete calls = %d, want 0 (declined confirmation must not touch the API)", fake.deleteCalls)
		}
	})

	t.Run("--force skips the prompt without reading stdin", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		// A pending "n" on stdin proves --force: were the prompt consulted,
		// this answer would decline the delete.
		out, err := execCLIWithStdin(t, credsPath, "n\n",
			"content", "delete", "pages", "about", "--force", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("forced delete: %v\noutput:\n%s", err, out)
		}
		if fake.deleteCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteCalls)
		}
		if strings.Contains(out, "[y/N]") {
			t.Errorf("--force still printed a confirmation prompt\noutput:\n%s", out)
		}
	})

	t.Run("delete --json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "delete", "pages", "about",
			"--force", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"slug": "about", "collection": "pages", "message": "Deleted",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("publish posts an explicit published status", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "publish", "pages", "about", "--api-url", srv.URL)

		if fake.publishCalls != 1 {
			t.Errorf("publish calls = %d, want 1", fake.publishCalls)
		}
		if fake.lastPublishSlug != "about" {
			t.Errorf("publish slug = %q, want %q", fake.lastPublishSlug, "about")
		}
		want := map[string]any{"status": "published"}
		if !reflect.DeepEqual(fake.lastPublishBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v (explicit status, never the toggle path)",
				fake.lastPublishBody, want)
		}
		if wantOut := "Published pages/about\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("unpublish posts an explicit draft status", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "unpublish", "pages", "about", "--api-url", srv.URL)

		if fake.publishCalls != 1 {
			t.Errorf("publish calls = %d, want 1", fake.publishCalls)
		}
		want := map[string]any{"status": "draft"}
		if !reflect.DeepEqual(fake.lastPublishBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v (explicit status, never the toggle path)",
				fake.lastPublishBody, want)
		}
		if wantOut := "Unpublished pages/about\n"; out != wantOut {
			t.Errorf("confirmation output = %q, want %q", out, wantOut)
		}
	})

	t.Run("publish --json emits the raw response data", func(t *testing.T) {
		_, srv, credsPath := startContentServer(t)

		out := runCLI(t, credsPath, "content", "publish", "pages", "about",
			"--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"slug": "about", "collection": "pages", "locale": "en", "status": "published",
			"version": 2, "liveVersion": 2, "message": "Published",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("server-side delete rejection surfaces its message and a non-zero exit", func(t *testing.T) {
		fake, srv, credsPath := startContentServer(t)

		out, err := execCLI(t, credsPath, "content", "delete", "pages", "referenced",
			"--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for referenced document, got success\noutput:\n%s", out)
		}
		if fake.deleteCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteCalls)
		}
		want := "Cannot delete: referenced by other content"
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
		if !strings.Contains(out, want) {
			t.Errorf("output does not surface the API error message %q\noutput:\n%s", want, out)
		}
	})
}

// execCLIWithStdin is execCLI with the command's stdin wired to a fixed string.
func execCLIWithStdin(t *testing.T, credsPath, stdin string, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd(credsPath)
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetIn(strings.NewReader(stdin))
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), err
}
