package detect

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeFiles creates each named file, empty, in dir.
func writeFiles(t *testing.T, dir string, names ...string) {
	t.Helper()
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(dir, name), nil, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
}

func TestDetectFramework(t *testing.T) {
	frameworks := []struct {
		name      string
		files     []string
		wantName  string
		wantDev   string
		wantBuild string
	}{
		{"next.config.ts", []string{"next.config.ts"}, "Next.js", "npx next dev", "npx next build"},
		{"next.config.js", []string{"next.config.js"}, "Next.js", "npx next dev", "npx next build"},
		{"next.config.mjs", []string{"next.config.mjs"}, "Next.js", "npx next dev", "npx next build"},
		{"svelte.config.js", []string{"svelte.config.js"}, "SvelteKit", "npx vite dev", "npx vite build"},
		{"svelte.config.ts", []string{"svelte.config.ts"}, "SvelteKit", "npx vite dev", "npx vite build"},
		{"vite.config.ts", []string{"vite.config.ts"}, "Vite", "npx vite", "npx vite build"},
		{"vite.config.js", []string{"vite.config.js"}, "Vite", "npx vite", "npx vite build"},
		{
			// A real SvelteKit project ships both configs — the svelte
			// config must win over the vite fallback.
			"svelte config beats the vite config it ships with",
			[]string{"svelte.config.js", "vite.config.ts"},
			"SvelteKit", "npx vite dev", "npx vite build",
		},
	}
	for _, tc := range frameworks {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeFiles(t, dir, tc.files...)

			framework, err := Detect(dir)

			if err != nil {
				t.Fatalf("Detect: %v", err)
			}
			if framework.Name != tc.wantName {
				t.Errorf("framework = %q, want %q", framework.Name, tc.wantName)
			}
			if framework.PackageManager != "npm" {
				t.Errorf("package manager = %q, want npm (no pnpm-lock.yaml)", framework.PackageManager)
			}
			if got := strings.Join(framework.DevCommand(0), " "); got != tc.wantDev {
				t.Errorf("dev command = %q, want %q", got, tc.wantDev)
			}
			if got := strings.Join(framework.BuildCommand(), " "); got != tc.wantBuild {
				t.Errorf("build command = %q, want %q", got, tc.wantBuild)
			}
		})
	}

	t.Run("no framework lists what was looked for", func(t *testing.T) {
		_, err := Detect(t.TempDir())

		if err == nil {
			t.Fatal("expected error for an empty directory, got a framework")
		}
		for _, name := range []string{
			"next.config.ts", "next.config.js", "next.config.mjs",
			"svelte.config.js", "svelte.config.ts",
			"vite.config.ts", "vite.config.js",
		} {
			if !strings.Contains(err.Error(), name) {
				t.Errorf("error %q missing looked-for config %q", err, name)
			}
		}
	})

	t.Run("pnpm-lock.yaml selects pnpm exec", func(t *testing.T) {
		dir := t.TempDir()
		writeFiles(t, dir, "next.config.ts", "pnpm-lock.yaml")

		framework, err := Detect(dir)

		if err != nil {
			t.Fatalf("Detect: %v", err)
		}
		if framework.PackageManager != "pnpm" {
			t.Errorf("package manager = %q, want pnpm", framework.PackageManager)
		}
		if got := strings.Join(framework.DevCommand(0), " "); got != "pnpm exec next dev" {
			t.Errorf("dev command = %q, want %q", got, "pnpm exec next dev")
		}
		if got := strings.Join(framework.BuildCommand(), " "); got != "pnpm exec next build" {
			t.Errorf("build command = %q, want %q", got, "pnpm exec next build")
		}
	})

	t.Run("a port appends the framework's port flag", func(t *testing.T) {
		dir := t.TempDir()
		writeFiles(t, dir, "vite.config.ts")

		framework, err := Detect(dir)

		if err != nil {
			t.Fatalf("Detect: %v", err)
		}
		if got := strings.Join(framework.DevCommand(5173), " "); got != "npx vite --port 5173" {
			t.Errorf("dev command = %q, want %q", got, "npx vite --port 5173")
		}
	})
}
