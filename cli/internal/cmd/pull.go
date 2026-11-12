package cmd

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/spf13/cobra"
)

// EnvToken is the environment variable that carries a bearer token for
// non-interactive use: a CI job's identity token, or an API token.
const EnvToken = "KRANTHO_TOKEN"

// newPullCmd builds `krantho pull`: bring the edits editors made in
// production back to the repository as a branch to review and merge.
func newPullCmd(opts *rootOptions) *cobra.Command {
	var contentDir, branch, base, token string
	var dryRun, push bool
	pull := &cobra.Command{
		Use:   "pull",
		Short: "Bring production's content edits back to the repository as a branch",
		Long: `Reads what editors changed in production since its last content import
(GET /api/changes) and writes it as a commit on a new branch cut from the
commit production last took its content from. The branch is yours to review
and merge with git; the working tree and the current branch are never touched.

Only published content is pulled. Authenticate with ` + EnvToken + ` or --token (a CI
job's identity token works), or with the credentials of ` + "`krantho auth login`" + `.`,
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, err := pullClient(opts, token)
			if err != nil {
				return err
			}
			changes, err := client.ContentChanges()
			if err != nil {
				return err
			}
			return runPull(cmd, changes, pullOptions{
				contentDir: contentDir, branch: branch, base: base, dryRun: dryRun, push: push,
			})
		},
	}
	pull.Flags().StringVar(&contentDir, "content-dir", "content",
		"the content directory, relative to the repository root")
	pull.Flags().StringVar(&branch, "branch", "",
		"the branch to create (default prod-pull/<UTC date and time>)")
	pull.Flags().StringVar(&base, "base", "",
		"start from this commit instead of the one production recorded")
	pull.Flags().StringVar(&token, "token", "", "bearer token (env "+EnvToken+")")
	pull.Flags().BoolVar(&dryRun, "dry-run", false, "list the changes and write nothing")
	pull.Flags().BoolVar(&push, "push", false, "push the new branch to origin")
	return pull
}

type pullOptions struct {
	contentDir, branch, base string
	dryRun, push             bool
}

// pullClient authenticates with a token from the flag or environment when
// there is one, and with the stored session otherwise.
func pullClient(opts *rootOptions, flagToken string) (*api.Client, error) {
	token := flagToken
	if token == "" {
		token = os.Getenv(EnvToken)
	}
	if token != "" {
		return api.New(opts.baseURL, token, nil), nil
	}
	sess, err := newSession(opts)
	if err != nil {
		return nil, err
	}
	return sess.client, nil
}

func runPull(cmd *cobra.Command, changes *api.Changes, o pullOptions) error {
	out := cmd.OutOrStdout()
	if len(changes.Changes) == 0 {
		_, err := fmt.Fprintln(out, "Production has no edits the repository lacks.")
		return err
	}
	for _, change := range changes.Changes {
		if _, err := fmt.Fprintf(out, "%-6s %s\n", change.Action, change.Path); err != nil {
			return err
		}
	}
	if o.dryRun {
		return nil
	}
	commit := o.base
	if commit == "" && changes.Baseline.Commit != nil {
		commit = *changes.Baseline.Commit
	}
	if commit == "" {
		return errors.New("production recorded no commit for its last import — pass --base <commit>")
	}
	branch := o.branch
	if branch == "" {
		branch = "prod-pull/" + time.Now().UTC().Format("20060102-150405")
	}
	if err := writeBranch(changes.Changes, commit, branch, o.contentDir); err != nil {
		return err
	}
	if o.push {
		if err := git("", "push", "origin", branch); err != nil {
			return err
		}
	}
	_, err := fmt.Fprintf(out, "\nBranch %s holds %d changes on top of %s.\nReview and merge it: git merge %s\n",
		branch, len(changes.Changes), commit[:min(len(commit), 12)], branch)
	return err
}

// writeBranch commits the changes on a new branch cut from commit, in a
// temporary worktree so the caller's checkout stays as it is.
func writeBranch(changes []api.ContentChange, commit, branch, contentDir string) (err error) {
	if err := git("", "cat-file", "-e", commit+"^{commit}"); err != nil {
		return fmt.Errorf("commit %s is not in this clone — fetch it first (git fetch origin)", commit)
	}
	dir, err := os.MkdirTemp("", "krantho-pull-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if err := git("", "worktree", "add", "-q", "-b", branch, dir, commit); err != nil {
		return err
	}
	defer func() {
		_ = git("", "worktree", "remove", "--force", dir)
		if err != nil {
			// a failed pull leaves no branch behind, so a retry can use the same name
			_ = git("", "branch", "-D", branch)
		}
	}()

	for _, change := range changes {
		if err := applyChange(filepath.Join(dir, contentDir), change); err != nil {
			return err
		}
	}
	if err := git(dir, "add", "-A", "--", contentDir); err != nil {
		return err
	}
	return git(dir, "commit", "-q", "-m", commitMessage(changes, commit))
}

// applyChange writes or removes one file under root, refusing any path that
// would leave it: paths arrive from the server and are written locally.
func applyChange(root string, change api.ContentChange) error {
	if !safeContentPath(change.Path) {
		return fmt.Errorf("path %q is not a safe content file", change.Path)
	}
	target := filepath.Join(root, filepath.FromSlash(change.Path))
	if change.Action == "delete" {
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}
	if change.Content == nil {
		return fmt.Errorf("change to %s carries no file", change.Path)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, []byte(*change.Content), 0o644)
}

// safeContentPath accepts a relative, forward-slash markdown path with no
// dot segments.
func safeContentPath(p string) bool {
	if p == "" || strings.Contains(p, `\`) || path.IsAbs(p) || !strings.HasSuffix(p, ".md") {
		return false
	}
	for _, segment := range strings.Split(p, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return false
		}
	}
	return true
}

func commitMessage(changes []api.ContentChange, commit string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "chore(content): production edits since %s\n\n", commit[:min(len(commit), 12)])
	for _, change := range changes {
		fmt.Fprintf(&b, "- %s %s\n", change.Action, change.Path)
	}
	return b.String()
}

// git runs a git command in dir (the current directory when empty) and
// returns its error with the output attached.
func git(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git %s: %w\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}
