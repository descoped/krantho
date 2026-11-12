package cmd

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/output"
	"github.com/spf13/cobra"
)

// newSnapshotCmd groups the checkpoint commands.
func newSnapshotCmd(opts *rootOptions) *cobra.Command {
	snapshot := &cobra.Command{
		Use:   "snapshot",
		Short: "Manage point-in-time checkpoints of the content store",
	}
	snapshot.AddCommand(
		newSnapshotCreateCmd(opts),
		newSnapshotListCmd(opts),
		newSnapshotRestoreCmd(opts),
		newSnapshotDeleteCmd(opts),
	)
	return snapshot
}

func newSnapshotCreateCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "create [name]",
		Short:        "Create a checkpoint",
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			name := ""
			if len(args) == 1 {
				name = args[0]
			}
			return runSnapshotCreate(cmd, opts, name)
		},
	}
}

// runSnapshotCreate posts POST /api/checkpoints (snapshot-create.ts) — the
// optional name travels in the body, omitted when empty — and prints the
// created checkpoint or, with --json, the raw 201 response.
func runSnapshotCreate(cmd *cobra.Command, opts *rootOptions, name string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	req := api.CreateCheckpointRequest{Name: name}
	if opts.json {
		raw, err := sess.RawPost(api.CheckpointsPath, req)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	checkpoint, err := sess.CreateCheckpoint(req)
	if err != nil {
		return err
	}
	label := ""
	if checkpoint.Name != nil && *checkpoint.Name != "" {
		label = fmt.Sprintf(" (%s)", *checkpoint.Name)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Created checkpoint v%d%s\n", checkpoint.Version, label)
	return err
}

func newSnapshotListCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "list",
		Short:        "List all checkpoints, newest first",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSnapshotList(cmd, opts)
		},
	}
}

// runSnapshotList renders GET /api/checkpoints (snapshot-list.ts, newest
// first) as a VERSION / NAME / TRIGGER / CREATED table or, with --json,
// the raw response.
func runSnapshotList(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.Raw(api.CheckpointsPath)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	list, err := sess.ListCheckpoints()
	if err != nil {
		return err
	}
	rows := make([][]string, 0, len(list.Checkpoints))
	for _, checkpoint := range list.Checkpoints {
		name := "-"
		if checkpoint.Name != nil && *checkpoint.Name != "" {
			name = *checkpoint.Name
		}
		rows = append(rows, []string{
			"v" + strconv.Itoa(checkpoint.Version), name, checkpoint.Trigger, checkpoint.CreatedAt,
		})
	}
	return output.Table(cmd.OutOrStdout(), []string{"VERSION", "NAME", "TRIGGER", "CREATED"}, rows)
}

func newSnapshotRestoreCmd(opts *rootOptions) *cobra.Command {
	var force bool
	restore := &cobra.Command{
		Use:          "restore <version>",
		Short:        "Restore the content store to a checkpoint",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSnapshotRestore(cmd, opts, args[0], force)
		},
	}
	restore.Flags().BoolVar(&force, "force", false, "restore without asking for confirmation")
	return restore
}

// runSnapshotRestore posts POST /api/checkpoints/:version/restore
// (snapshot-restore.ts) after an interactive confirmation (skipped by
// --force) — restoring rewinds every document to the checkpoint's point in
// time, overwriting the current state — and prints the handler's message
// or, with --json, the raw response.
func runSnapshotRestore(cmd *cobra.Command, opts *rootOptions, versionArg string, force bool) error {
	version, err := parseVersionArg(versionArg)
	if err != nil {
		return err
	}
	if !force {
		confirmed, err := confirm(cmd, fmt.Sprintf(
			"Restore checkpoint v%d? Content changes made after it will be overwritten. [y/N] ", version))
		if err != nil {
			return err
		}
		if !confirmed {
			return errors.New("restore aborted")
		}
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawPost(api.CheckpointRestorePath(version), nil)
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.RestoreCheckpoint(version)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(cmd.OutOrStdout(), result.Message)
	return err
}

func newSnapshotDeleteCmd(opts *rootOptions) *cobra.Command {
	var force bool
	del := &cobra.Command{
		Use:          "delete <version>",
		Short:        "Delete a checkpoint",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSnapshotDelete(cmd, opts, args[0], force)
		},
	}
	del.Flags().BoolVar(&force, "force", false, "delete without asking for confirmation")
	return del
}

// runSnapshotDelete issues DELETE /api/checkpoints/:version
// (snapshot-delete.ts) after an interactive confirmation (skipped by
// --force) and prints a confirmation or, with --json, the raw response.
// An unknown version is the handler's 404 and surfaces as-is.
func runSnapshotDelete(cmd *cobra.Command, opts *rootOptions, versionArg string, force bool) error {
	version, err := parseVersionArg(versionArg)
	if err != nil {
		return err
	}
	if !force {
		confirmed, err := confirm(cmd, fmt.Sprintf("Delete checkpoint v%d? [y/N] ", version))
		if err != nil {
			return err
		}
		if !confirmed {
			return errors.New("delete aborted")
		}
	}
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if opts.json {
		raw, err := sess.RawDelete(api.CheckpointPath(version))
		if err != nil {
			return err
		}
		return output.RawJSON(cmd.OutOrStdout(), raw)
	}
	result, err := sess.DeleteCheckpoint(version)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "Deleted checkpoint v%d\n", result.Version)
	return err
}

// parseVersionArg parses the <version> argument; both a bare number and
// the v-prefixed form the CLI itself prints are accepted.
func parseVersionArg(arg string) (int, error) {
	version, err := strconv.Atoi(strings.TrimPrefix(arg, "v"))
	if err != nil {
		return 0, fmt.Errorf("invalid checkpoint version %q: expected a number like 3 or v3", arg)
	}
	return version, nil
}
