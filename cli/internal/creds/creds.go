// Package creds stores krantho API credentials in ~/.krantho/credentials.json.
package creds

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Entry holds the tokens stored for one API origin. RefreshToken may be
// empty when the server issued no refresh cookie.
type Entry struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

// Store is a credentials file keyed by API origin. Construct it with
// NewStore; the file path is explicit so tests can point it at a temp dir.
type Store struct {
	path    string
	entries map[string]Entry
}

// NewStore returns an empty store bound to path. Call Load to read any
// existing file.
func NewStore(path string) *Store {
	return &Store{path: path, entries: map[string]Entry{}}
}

// DefaultPath returns ~/.krantho/credentials.json.
func DefaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".krantho", "credentials.json"), nil
}

// Load reads the credentials file. A missing file is not an error — the
// store stays empty, which is anonymous mode.
func (s *Store) Load() error {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		s.entries = map[string]Entry{}
		return nil
	}
	if err != nil {
		return err
	}
	entries := map[string]Entry{}
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}
	s.entries = entries
	return nil
}

// Get returns the entry stored for origin, if any.
func (s *Store) Get(origin string) (Entry, bool) {
	entry, ok := s.entries[origin]
	return entry, ok
}

// Set stores entry under origin. Call Save to persist.
func (s *Store) Set(origin string, entry Entry) {
	s.entries[origin] = entry
}

// Delete removes the entry for origin. Call Save to persist.
func (s *Store) Delete(origin string) {
	delete(s.entries, origin)
}

// Save writes the store to its file with mode 0600, creating the parent
// directory (0700) if needed. An existing file is chmodded so it ends up
// 0600 even if its permissions drifted.
func (s *Store) Save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.entries, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return err
	}
	return os.Chmod(s.path, 0o600)
}
