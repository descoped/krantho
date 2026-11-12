package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

// fakeSnapshotServer serves the /api/checkpoints endpoints with the shapes
// of the real handlers: list (snapshot-list.ts), create
// (snapshot-create.ts), restore (snapshot-restore.ts), and delete
// (snapshot-delete.ts). Checkpoint v3 exists; any other version is the
// handlers' 404.
type fakeSnapshotServer struct {
	createCalls    int
	lastCreateBody map[string]any
	listCalls      int
	restoreCalls   int
	lastRestored   int
	deleteCalls    int
	failRestore    bool
}

func (f *fakeSnapshotServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/checkpoints", f.list)
	mux.HandleFunc("POST /api/checkpoints", f.create)
	mux.HandleFunc("POST /api/checkpoints/{version}/restore", f.restore)
	mux.HandleFunc("DELETE /api/checkpoints/{version}", f.del)
	return mux
}

// create mirrors snapshot-create.ts: the CheckpointInfo itself is the bare
// 201 body, name null when the request carried none.
func (f *fakeSnapshotServer) create(w http.ResponseWriter, r *http.Request) {
	f.createCalls++
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	f.lastCreateBody = body
	created := map[string]any{
		"id": 4, "version": 4, "name": nil, "trigger": "manual",
		"createdAt": "2026-07-02T09:00:00.000Z",
	}
	if name, ok := body["name"].(string); ok {
		created["name"] = name
	}
	writeJSON(w, http.StatusCreated, created)
}

func (f *fakeSnapshotServer) list(w http.ResponseWriter, _ *http.Request) {
	f.listCalls++
	writeRawJSON(w, checkpointListJSON)
}

// restore mirrors snapshot-restore.ts: 200 { restored, message } on
// success, the not-found 404, and any other failure as a 500.
func (f *fakeSnapshotServer) restore(w http.ResponseWriter, r *http.Request) {
	f.restoreCalls++
	version, _ := strconv.Atoi(r.PathValue("version"))
	f.lastRestored = version
	if f.failRestore {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Restore failed"})
		return
	}
	if version != 3 {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": "Checkpoint version " + strconv.Itoa(version) + " not found",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"restored": map[string]any{
			"id": 3, "version": 3, "name": "before-import", "trigger": "pre-import",
			"createdAt": "2026-07-01T12:00:00.000Z",
		},
		"message": "Restored from checkpoint v3",
	})
}

// del mirrors snapshot-delete.ts: { deleted: true, version } or the 404.
func (f *fakeSnapshotServer) del(w http.ResponseWriter, r *http.Request) {
	f.deleteCalls++
	version, _ := strconv.Atoi(r.PathValue("version"))
	if version != 3 {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": "Checkpoint version " + strconv.Itoa(version) + " not found",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "version": 3})
}

// checkpointListJSON is the snapshot-list.ts 200 body, newest first, one
// checkpoint unnamed (name null) like an unnamed createCheckpoint.
const checkpointListJSON = `{
	"checkpoints": [
		{"id": 3, "version": 3, "name": "before-import", "trigger": "pre-import", "createdAt": "2026-07-01T12:00:00.000Z"},
		{"id": 1, "version": 1, "name": null, "trigger": "manual", "createdAt": "2026-06-30T09:30:00.000Z"}
	]
}`

// startSnapshotServer starts a fresh fake checkpoint API and returns it
// with a test-scoped credentials path.
func startSnapshotServer(t *testing.T) (*fakeSnapshotServer, *httptest.Server, string) {
	t.Helper()
	fake := &fakeSnapshotServer{}
	srv := httptest.NewServer(fake.handler())
	t.Cleanup(srv.Close)
	return fake, srv, filepath.Join(t.TempDir(), "credentials.json")
}

func TestSnapshotCommands(t *testing.T) {
	t.Run("create posts the name and prints the checkpoint", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "create", "before-launch", "--api-url", srv.URL)

		if fake.createCalls != 1 {
			t.Errorf("create calls = %d, want 1", fake.createCalls)
		}
		if want := roundTripJSON(t, map[string]any{"name": "before-launch"}); !reflect.DeepEqual(fake.lastCreateBody, want) {
			t.Errorf("request body\ngot:  %#v\nwant: %#v", fake.lastCreateBody, want)
		}
		if want := "Created checkpoint v4 (before-launch)\n"; out != want {
			t.Errorf("output = %q, want %q", out, want)
		}
	})

	t.Run("create without a name omits it from the body", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "create", "--api-url", srv.URL)

		if want := map[string]any{}; !reflect.DeepEqual(fake.lastCreateBody, want) {
			t.Errorf("request body = %#v, want empty object", fake.lastCreateBody)
		}
		if want := "Created checkpoint v4\n"; out != want {
			t.Errorf("output = %q, want %q", out, want)
		}
	})

	t.Run("create --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "create", "before-launch", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"id": 4, "version": 4, "name": "before-launch", "trigger": "manual",
			"createdAt": "2026-07-02T09:00:00.000Z",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("list renders the newest-first table", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "list", "--api-url", srv.URL)

		if fake.listCalls != 1 {
			t.Errorf("list calls = %d, want 1", fake.listCalls)
		}
		lineContaining(t, out, "VERSION", "NAME", "TRIGGER", "CREATED")
		lineContaining(t, out, "v3", "before-import", "pre-import", "2026-07-01T12:00:00.000Z")
		lineContaining(t, out, "v1", "-", "manual", "2026-06-30T09:30:00.000Z")
	})

	t.Run("list --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "list", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		// The null name must survive as null — raw passthrough, not the
		// typed struct's rendering.
		if want := decodeFixture(t, checkpointListJSON); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("restore asks for confirmation and aborts on anything but y", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out, err := execCLIWithStdin(t, credsPath, "n\n", "snapshot", "restore", "3", "--api-url", srv.URL)

		if err == nil || err.Error() != "restore aborted" {
			t.Errorf("error = %v, want restore aborted", err)
		}
		if want := "Restore checkpoint v3? Content changes made after it will be overwritten. [y/N] "; !strings.Contains(out, want) {
			t.Errorf("output missing the confirmation prompt %q\noutput:\n%s", want, out)
		}
		if fake.restoreCalls != 0 {
			t.Errorf("restore calls = %d, want 0 (declined)", fake.restoreCalls)
		}
	})

	t.Run("restore proceeds on y", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out, err := execCLIWithStdin(t, credsPath, "y\n", "snapshot", "restore", "3", "--api-url", srv.URL)

		if err != nil {
			t.Fatalf("restore: %v\noutput:\n%s", err, out)
		}
		if fake.restoreCalls != 1 || fake.lastRestored != 3 {
			t.Errorf("restore calls = %d for v%d, want 1 for v3", fake.restoreCalls, fake.lastRestored)
		}
		if want := "Restored from checkpoint v3\n"; !strings.Contains(out, want) {
			t.Errorf("output missing %q\noutput:\n%s", want, out)
		}
	})

	t.Run("restore --force skips the prompt", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "restore", "3", "--force", "--api-url", srv.URL)

		if fake.restoreCalls != 1 {
			t.Errorf("restore calls = %d, want 1", fake.restoreCalls)
		}
		if want := "Restored from checkpoint v3\n"; out != want {
			t.Errorf("output = %q, want %q (no prompt)", out, want)
		}
	})

	t.Run("restore --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "restore", "3", "--force", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		want := roundTripJSON(t, map[string]any{
			"restored": map[string]any{
				"id": 3, "version": 3, "name": "before-import", "trigger": "pre-import",
				"createdAt": "2026-07-01T12:00:00.000Z",
			},
			"message": "Restored from checkpoint v3",
		})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("a restore failure surfaces the 500 and exits non-zero", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)
		fake.failRestore = true

		out, err := execCLI(t, credsPath, "snapshot", "restore", "3", "--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for the failed restore, got success\noutput:\n%s", out)
		}
		if want := "Restore failed"; !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
	})

	t.Run("delete asks for confirmation and aborts on anything but y", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out, err := execCLIWithStdin(t, credsPath, "\n", "snapshot", "delete", "3", "--api-url", srv.URL)

		if err == nil || err.Error() != "delete aborted" {
			t.Errorf("error = %v, want delete aborted", err)
		}
		if want := "Delete checkpoint v3? [y/N] "; !strings.Contains(out, want) {
			t.Errorf("output missing the confirmation prompt %q\noutput:\n%s", want, out)
		}
		if fake.deleteCalls != 0 {
			t.Errorf("delete calls = %d, want 0 (declined)", fake.deleteCalls)
		}
	})

	t.Run("delete --force deletes, accepting the v-prefixed version", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "delete", "v3", "--force", "--api-url", srv.URL)

		if fake.deleteCalls != 1 {
			t.Errorf("delete calls = %d, want 1", fake.deleteCalls)
		}
		if want := "Deleted checkpoint v3\n"; out != want {
			t.Errorf("output = %q, want %q", out, want)
		}
	})

	t.Run("delete --json is raw passthrough", func(t *testing.T) {
		_, srv, credsPath := startSnapshotServer(t)

		out := runCLI(t, credsPath, "snapshot", "delete", "3", "--force", "--json", "--api-url", srv.URL)

		var got map[string]any
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("--json output is not valid JSON: %v\noutput:\n%s", err, out)
		}
		if want := roundTripJSON(t, map[string]any{"deleted": true, "version": 3}); !reflect.DeepEqual(got, want) {
			t.Errorf("--json output differs from server response\ngot:  %#v\nwant: %#v", got, want)
		}
	})

	t.Run("an unknown version surfaces the 404 and exits non-zero", func(t *testing.T) {
		_, srv, credsPath := startSnapshotServer(t)

		out, err := execCLI(t, credsPath, "snapshot", "delete", "9", "--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatalf("expected error for the unknown version, got success\noutput:\n%s", out)
		}
		if want := "Checkpoint version 9 not found"; !strings.Contains(err.Error(), want) {
			t.Errorf("error = %q, want it to contain %q", err.Error(), want)
		}
	})

	t.Run("an invalid version argument fails before any request", func(t *testing.T) {
		fake, srv, credsPath := startSnapshotServer(t)

		_, err := execCLI(t, credsPath, "snapshot", "restore", "latest", "--force", "--api-url", srv.URL)

		if err == nil {
			t.Fatal("expected error for the invalid version, got success")
		}
		if !strings.Contains(err.Error(), `invalid checkpoint version "latest"`) {
			t.Errorf("error = %q, want it to name the invalid version", err.Error())
		}
		if fake.restoreCalls != 0 {
			t.Errorf("restore calls = %d, want 0 (client-side validation must reject first)", fake.restoreCalls)
		}
	})
}
