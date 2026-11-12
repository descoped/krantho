package cmd

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/descoped/krantho/cli/internal/detect"
	"github.com/spf13/cobra"
)

// newDevCmd runs the detected framework's dev server in the project
// directory. Local command — no API involved.
func newDevCmd() *cobra.Command {
	var dir string
	var port int
	var dryRun bool
	dev := &cobra.Command{
		Use:   "dev",
		Short: "Run the project's framework dev server",
		Long: `Run the project's framework dev server.

Detects the framework from the project directory's config file — Next.js,
SvelteKit, or Vite — and runs its dev command through the project's package
manager: pnpm exec when pnpm-lock.yaml exists, npx otherwise.`,
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runFrameworkCommand(cmd, dir, dryRun, func(framework detect.Framework) []string {
				return framework.DevCommand(port)
			})
		},
	}
	dev.Flags().StringVar(&dir, "dir", ".", "project directory to detect the framework in")
	dev.Flags().IntVar(&port, "port", 0, "dev server port (framework default when omitted)")
	dev.Flags().BoolVar(&dryRun, "dry-run", false, "print the resolved command instead of running it")
	return dev
}

// newBuildCmd runs the detected framework's production build in the
// project directory. Local command — no API involved.
func newBuildCmd() *cobra.Command {
	var dir string
	var dryRun bool
	build := &cobra.Command{
		Use:   "build",
		Short: "Run the project's framework production build",
		Long: `Run the project's framework production build.

Detects the framework from the project directory's config file — Next.js,
SvelteKit, or Vite — and runs its build command through the project's
package manager: pnpm exec when pnpm-lock.yaml exists, npx otherwise.`,
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runFrameworkCommand(cmd, dir, dryRun, detect.Framework.BuildCommand)
		},
	}
	build.Flags().StringVar(&dir, "dir", ".", "project directory to detect the framework in")
	build.Flags().BoolVar(&dryRun, "dry-run", false, "print the resolved command instead of running it")
	return build
}

// runFrameworkCommand detects the project's framework, resolves the full
// command line, and either prints it (--dry-run) or runs it in the
// project directory wired to the CLI's stdio, propagating its exit error.
func runFrameworkCommand(cmd *cobra.Command, dir string, dryRun bool, resolve func(detect.Framework) []string) error {
	framework, err := detect.Detect(dir)
	if err != nil {
		return err
	}
	command := resolve(framework)
	if dryRun {
		_, err := fmt.Fprintln(cmd.OutOrStdout(), strings.Join(command, " "))
		return err
	}
	if _, err := fmt.Fprintf(cmd.ErrOrStderr(), "Detected %s — running %s\n",
		framework.Name, strings.Join(command, " ")); err != nil {
		return err
	}
	proc := exec.Command(command[0], command[1:]...)
	proc.Dir = dir
	proc.Stdin = cmd.InOrStdin()
	proc.Stdout = cmd.OutOrStdout()
	proc.Stderr = cmd.ErrOrStderr()
	return proc.Run()
}
