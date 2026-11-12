package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// frameworkDir creates a temp project dir carrying the given marker files.
func frameworkDir(t *testing.T, files ...string) string {
	t.Helper()
	dir := t.TempDir()
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("// marker\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// TestDevDryRun proves dev/build --dry-run print the resolved command line
// (framework command through the project's package manager) without
// spawning anything.
func TestDevDryRun(t *testing.T) {
	cases := []struct {
		name  string
		files []string
		args  []string
		want  string
	}{
		{
			name:  "next dev via pnpm",
			files: []string{"next.config.ts", "pnpm-lock.yaml"},
			args:  []string{"dev", "--dry-run"},
			want:  "pnpm exec next dev\n",
		},
		{
			name:  "next dev with port via npm",
			files: []string{"next.config.mjs"},
			args:  []string{"dev", "--dry-run", "--port", "4002"},
			want:  "npx next dev --port 4002\n",
		},
		{
			name:  "sveltekit dev beats its vite config",
			files: []string{"svelte.config.js", "vite.config.ts", "pnpm-lock.yaml"},
			args:  []string{"dev", "--dry-run"},
			want:  "pnpm exec vite dev\n",
		},
		{
			name:  "vite build via npm",
			files: []string{"vite.config.js"},
			args:  []string{"build", "--dry-run"},
			want:  "npx vite build\n",
		},
		{
			name:  "next build via pnpm",
			files: []string{"next.config.js", "pnpm-lock.yaml"},
			args:  []string{"build", "--dry-run"},
			want:  "pnpm exec next build\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := frameworkDir(t, tc.files...)
			credsPath := filepath.Join(t.TempDir(), "credentials.json")
			out := runCLI(t, credsPath, append(tc.args, "--dir", dir)...)
			if out != tc.want {
				t.Fatalf("dry-run output %q, want %q", out, tc.want)
			}
		})
	}

	t.Run("no framework errors non-zero and names the configs", func(t *testing.T) {
		dir := t.TempDir()
		credsPath := filepath.Join(t.TempDir(), "credentials.json")
		out, err := execCLI(t, credsPath, "dev", "--dry-run", "--dir", dir)
		if err == nil {
			t.Fatalf("expected error for undetectable framework, output:\n%s", out)
		}
		if !strings.Contains(err.Error(), "next.config.ts") {
			t.Fatalf("error should list the configs looked for, got: %v", err)
		}
	})
}
