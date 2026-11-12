// Package detect resolves which frontend framework a krantho project
// uses so krantho dev/build can run the framework's own commands.
package detect

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Framework is a detected frontend framework: its dev and build commands
// plus the package manager that runs them.
type Framework struct {
	Name           string   // human-readable name, e.g. "Next.js"
	DevArgs        []string // framework dev-server command, e.g. next dev
	BuildArgs      []string // framework production-build command
	PortFlag       string   // flag the framework's dev command takes for a custom port
	PackageManager string   // "pnpm" (pnpm-lock.yaml present) or "npm"
}

// candidate pairs a framework with the config files that identify it.
// Order matters: a SvelteKit project also carries a vite config, so Vite
// is the fallback, tried last.
type candidate struct {
	framework Framework
	configs   []string
}

var candidates = []candidate{
	{
		framework: Framework{
			Name:      "Next.js",
			DevArgs:   []string{"next", "dev"},
			BuildArgs: []string{"next", "build"},
			PortFlag:  "--port",
		},
		configs: []string{"next.config.ts", "next.config.js", "next.config.mjs"},
	},
	{
		framework: Framework{
			Name:      "SvelteKit",
			DevArgs:   []string{"vite", "dev"},
			BuildArgs: []string{"vite", "build"},
			PortFlag:  "--port",
		},
		configs: []string{"svelte.config.js", "svelte.config.ts"},
	},
	{
		framework: Framework{
			Name:      "Vite",
			DevArgs:   []string{"vite"},
			BuildArgs: []string{"vite", "build"},
			PortFlag:  "--port",
		},
		configs: []string{"vite.config.ts", "vite.config.js"},
	},
}

// Detect inspects dir's config files and returns the framework to run:
// Next.js (next.config.ts|js|mjs), SvelteKit (svelte.config.js|ts), or
// Vite (vite.config.ts|js) as the fallback. The package manager is pnpm
// when pnpm-lock.yaml exists in dir, npm otherwise.
func Detect(dir string) (Framework, error) {
	packageManager := "npm"
	if fileExists(filepath.Join(dir, "pnpm-lock.yaml")) {
		packageManager = "pnpm"
	}
	for _, c := range candidates {
		for _, config := range c.configs {
			if fileExists(filepath.Join(dir, config)) {
				framework := c.framework
				framework.PackageManager = packageManager
				return framework, nil
			}
		}
	}
	return Framework{}, fmt.Errorf("no framework detected in %s (looked for %s)",
		dir, strings.Join(knownConfigs(), ", "))
}

// DevCommand is the dev-server command line through the package manager's
// executor; port 0 keeps the framework's default port.
func (f Framework) DevCommand(port int) []string {
	command := f.runner(f.DevArgs)
	if port > 0 {
		command = append(command, f.PortFlag, strconv.Itoa(port))
	}
	return command
}

// BuildCommand is the production-build command line through the package
// manager's executor.
func (f Framework) BuildCommand() []string {
	return f.runner(f.BuildArgs)
}

// runner prefixes args with the package manager's executor: pnpm exec for
// pnpm projects, npx otherwise.
func (f Framework) runner(args []string) []string {
	if f.PackageManager == "pnpm" {
		return append([]string{"pnpm", "exec"}, args...)
	}
	return append([]string{"npx"}, args...)
}

// knownConfigs lists every config filename detection looks for, in
// detection order — the "looked for" part of the no-framework error.
func knownConfigs() []string {
	var names []string
	for _, c := range candidates {
		names = append(names, c.configs...)
	}
	return names
}

// fileExists reports whether path exists as a regular file.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
