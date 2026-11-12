// Package cmd implements the krantho CLI command tree.
package cmd

import (
	"os"

	"github.com/descoped/krantho/cli/internal/config"
	"github.com/spf13/cobra"
)

// rootOptions carries the persistent root flags and the resolved configuration
// shared by every subcommand.
type rootOptions struct {
	apiURL    string // --api-url flag value (empty means unset)
	json      bool   // --json: emit raw JSON instead of human-readable output
	baseURL   string // resolved API base URL, populated before any subcommand runs
	credsPath string // credentials file override; empty means creds.DefaultPath()
}

// newRootCmd constructs the krantho root command. credsPath overrides the
// credentials file location for tests; empty selects the production default
// (~/.krantho/credentials.json).
func newRootCmd(credsPath string) *cobra.Command {
	opts := &rootOptions{credsPath: credsPath}

	root := &cobra.Command{
		Use:   "krantho",
		Short: "Terminal-first management for a krantho project via its REST API",
		Long: `Terminal-first management for a krantho project via its REST API.

krantho manages a running krantho project from the terminal. Every operation
goes through the project's REST API — local dev server or remote deployment —
never directly against the database or content files.`,
		PersistentPreRun: func(_ *cobra.Command, _ []string) {
			opts.baseURL = config.ResolveAPIURL(opts.apiURL, os.Getenv)
		},
	}

	root.PersistentFlags().StringVar(&opts.apiURL, "api-url", "",
		"krantho API base URL (env "+config.EnvAPIURL+", default "+config.DefaultAPIURL+")")
	root.PersistentFlags().BoolVar(&opts.json, "json", false,
		"output raw JSON instead of human-readable rendering")

	root.AddCommand(
		newAuthCmd(opts), newContentCmd(opts), newInfoCmd(opts), newSchemaCmd(opts),
		newExportCmd(opts), newImportCmd(opts), newPullCmd(opts), newSeoCmd(opts), newSnapshotCmd(opts),
		newDevCmd(), newBuildCmd(),
	)

	return root
}

// Execute runs the krantho CLI and returns the command error, if any.
func Execute() error {
	return newRootCmd("").Execute()
}
