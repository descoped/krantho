package creds

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCredsRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "credentials.json")
	localOrigin := "http://localhost:3000"
	remoteOrigin := "https://cms.example.com"

	// Missing file: Load succeeds and the store is empty but usable.
	store := NewStore(path)
	if err := store.Load(); err != nil {
		t.Fatalf("Load() with missing file: %v", err)
	}
	if _, ok := store.Get(localOrigin); ok {
		t.Fatal("Get() on empty store reported an entry")
	}

	// Save creates the parent directory and writes the file with mode 0600.
	local := Entry{AccessToken: "local-jwt", RefreshToken: "local-refresh"}
	remote := Entry{AccessToken: "remote-jwt"}
	store.Set(localOrigin, local)
	store.Set(remoteOrigin, remote)
	if err := store.Save(); err != nil {
		t.Fatalf("Save(): %v", err)
	}
	dirInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatalf("parent dir not created: %v", err)
	}
	if !dirInfo.IsDir() {
		t.Fatal("parent path is not a directory")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("credentials file not written: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("file mode = %o, want 0600", perm)
	}

	// On-disk shape matches the spec: {"<origin>": {"accessToken", "refreshToken"}}.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(): %v", err)
	}
	var shape map[string]map[string]string
	if err := json.Unmarshal(raw, &shape); err != nil {
		t.Fatalf("on-disk JSON: %v", err)
	}
	if got := shape[localOrigin]["accessToken"]; got != "local-jwt" {
		t.Fatalf("on-disk accessToken = %q, want %q", got, "local-jwt")
	}
	if got := shape[localOrigin]["refreshToken"]; got != "local-refresh" {
		t.Fatalf("on-disk refreshToken = %q, want %q", got, "local-refresh")
	}

	// Round trip: a fresh store loads both entries keyed by origin.
	loaded := NewStore(path)
	if err := loaded.Load(); err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if got, ok := loaded.Get(localOrigin); !ok || got != local {
		t.Fatalf("Get(%q) = %+v, %v; want %+v, true", localOrigin, got, ok, local)
	}
	if got, ok := loaded.Get(remoteOrigin); !ok || got != remote {
		t.Fatalf("Get(%q) = %+v, %v; want %+v, true", remoteOrigin, got, ok, remote)
	}

	// Save over an existing file with drifted permissions restores 0600.
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatalf("Chmod(): %v", err)
	}
	if err := loaded.Save(); err != nil {
		t.Fatalf("Save() over existing file: %v", err)
	}
	info, err = os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() after re-save: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("file mode after re-save = %o, want 0600", perm)
	}

	// Delete removes one origin without clobbering the other.
	loaded.Delete(localOrigin)
	if err := loaded.Save(); err != nil {
		t.Fatalf("Save() after Delete(): %v", err)
	}
	final := NewStore(path)
	if err := final.Load(); err != nil {
		t.Fatalf("Load() after Delete(): %v", err)
	}
	if _, ok := final.Get(localOrigin); ok {
		t.Fatal("deleted origin still present after reload")
	}
	if got, ok := final.Get(remoteOrigin); !ok || got != remote {
		t.Fatalf("surviving origin = %+v, %v; want %+v, true", got, ok, remote)
	}
}
