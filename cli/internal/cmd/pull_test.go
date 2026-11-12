package cmd

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// gitIn runs git in dir and returns its trimmed output.
func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=T", "GIT_AUTHOR_EMAIL=t@example.com",
		"GIT_COMMITTER_NAME=T", "GIT_COMMITTER_EMAIL=t@example.com")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

// pullRepo is a repository whose content directory holds two pages at the
// commit production last took, followed by a later commit on main that
// production's edits must not be applied on top of.
func pullRepo(t *testing.T) (dir, baseline string) {
	t.Helper()
	dir = t.TempDir()
	gitIn(t, dir, "init", "-q", "-b", "main")
	write := func(rel, text string) {
		path := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("site/content/pages/about.md", "---\ntitle: About\nstatus: published\n---\nAbout us\n")
	write("site/content/pages/home.md", "---\ntitle: Home\nstatus: published\n---\nWelcome\n")
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", "baseline")
	baseline = gitIn(t, dir, "rev-parse", "HEAD")
	write("site/content/pages/later.md", "---\ntitle: Later\nstatus: published\n---\nA later page\n")
	gitIn(t, dir, "add", "-A")
	gitIn(t, dir, "commit", "-q", "-m", "later")
	return dir, baseline
}

func changesServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/changes" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer ci-token" {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Authentication required"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func changesBody(commit string) string {
	return `{"baseline":{"commit":"` + commit + `","repoVersion":100,"importedAt":"2026-10-18T00:00:00Z"},
"changes":[
 {"action":"edit","collection":"pages","slug":"about","locale":"en","path":"pages/about.md","checksum":"x",
  "content":"---\ntitle: About\nstatus: published\n---\nAbout us, rewritten in Studio\n"},
 {"action":"add","collection":"pages","slug":"team","locale":"en","path":"pages/team.md","checksum":"y",
  "content":"---\ntitle: Team\nstatus: published\n---\nThe team\n"},
 {"action":"delete","collection":"pages","slug":"home","locale":"en","path":"pages/home.md","checksum":null,"content":null}
],"next":null}`
}

func TestPullWritesProductionEditsOnABranchFromTheBaseline(t *testing.T) {
	repo, baseline := pullRepo(t)
	srv := changesServer(t, changesBody(baseline))
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")

	out := runCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL,
		"pull", "--content-dir", "site/content", "--branch", "prod-pull/test")

	if !strings.Contains(out, "git merge prod-pull/test") {
		t.Errorf("output does not say how to merge:\n%s", out)
	}
	if got := gitIn(t, repo, "merge-base", "main", "prod-pull/test"); got != baseline {
		t.Errorf("branch is not cut from the baseline: merge-base %s, want %s", got, baseline)
	}
	about := gitIn(t, repo, "show", "prod-pull/test:site/content/pages/about.md")
	if !strings.Contains(about, "rewritten in Studio") {
		t.Errorf("about.md on the branch = %q", about)
	}
	gitIn(t, repo, "show", "prod-pull/test:site/content/pages/team.md")
	if files := gitIn(t, repo, "ls-tree", "-r", "--name-only", "prod-pull/test"); strings.Contains(files, "home.md") {
		t.Errorf("home.md should be deleted on the branch:\n%s", files)
	}
	subject := gitIn(t, repo, "log", "-1", "--format=%s", "prod-pull/test")
	if !strings.HasPrefix(subject, "chore(content): production edits since ") {
		t.Errorf("commit subject = %q", subject)
	}
}

func TestPullLeavesTheCurrentBranchAndWorkingTreeAlone(t *testing.T) {
	repo, baseline := pullRepo(t)
	srv := changesServer(t, changesBody(baseline))
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")
	head := gitIn(t, repo, "rev-parse", "HEAD")

	runCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL,
		"pull", "--content-dir", "site/content", "--branch", "prod-pull/test")

	if got := gitIn(t, repo, "rev-parse", "HEAD"); got != head {
		t.Errorf("main moved: %s -> %s", head, got)
	}
	if got := gitIn(t, repo, "branch", "--show-current"); got != "main" {
		t.Errorf("current branch = %q", got)
	}
	if status := gitIn(t, repo, "status", "--porcelain"); status != "" {
		t.Errorf("working tree is not clean:\n%s", status)
	}
	if worktrees := gitIn(t, repo, "worktree", "list"); strings.Count(worktrees, "\n") != 0 {
		t.Errorf("a worktree was left behind:\n%s", worktrees)
	}
}

func TestPullDryRunListsChangesAndWritesNothing(t *testing.T) {
	repo, baseline := pullRepo(t)
	srv := changesServer(t, changesBody(baseline))
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")

	out := runCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL, "pull", "--dry-run")

	for _, want := range []string{"edit   pages/about.md", "add    pages/team.md", "delete pages/home.md"} {
		if !strings.Contains(out, want) {
			t.Errorf("dry run output missing %q:\n%s", want, out)
		}
	}
	if branches := gitIn(t, repo, "branch", "--list", "prod-pull/*"); branches != "" {
		t.Errorf("dry run created a branch: %s", branches)
	}
}

func TestPullSaysSoWhenProductionHasNothingNew(t *testing.T) {
	repo, baseline := pullRepo(t)
	srv := changesServer(t, `{"baseline":{"commit":"`+baseline+`","repoVersion":1,"importedAt":""},"changes":[],"next":null}`)
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")

	out := runCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL, "pull")

	if !strings.Contains(out, "no edits the repository lacks") {
		t.Errorf("output = %q", out)
	}
}

func TestPullRefusesPathsThatLeaveTheContentDirectory(t *testing.T) {
	for _, bad := range []string{"../outside.md", "/etc/x.md", "pages/../../x.md", `pages\x.md`, "pages/x.txt", ""} {
		repo, baseline := pullRepo(t)
		body := `{"baseline":{"commit":"` + baseline + `"},"changes":[{"action":"add","collection":"pages","slug":"x","locale":"en","path":"` +
			strings.ReplaceAll(bad, `\`, `\\`) + `","checksum":"c","content":"x"}],"next":null}`
		srv := changesServer(t, body)
		t.Chdir(repo)
		t.Setenv(EnvToken, "ci-token")

		_, err := execCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL,
			"pull", "--content-dir", "site/content", "--branch", "prod-pull/bad")

		if err == nil {
			t.Errorf("path %q was accepted", bad)
		}
	}
}

func TestPullNeedsABaselineItCanFind(t *testing.T) {
	repo, _ := pullRepo(t)
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")
	body := func(commit string) string {
		return `{"baseline":{"commit":` + commit + `},"changes":[{"action":"delete","collection":"pages","slug":"home","locale":"en","path":"pages/home.md","checksum":null,"content":null}],"next":null}`
	}

	_, err := execCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", changesServer(t, body("null")).URL, "pull")
	if err == nil || !strings.Contains(err.Error(), "--base") {
		t.Errorf("a missing commit should point to --base, got %v", err)
	}
	_, err = execCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url",
		changesServer(t, body(`"`+strings.Repeat("0", 40)+`"`)).URL, "pull")
	if err == nil || !strings.Contains(err.Error(), "fetch") {
		t.Errorf("an unknown commit should say to fetch, got %v", err)
	}
}

func TestPullFollowsPages(t *testing.T) {
	repo, baseline := pullRepo(t)
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("cursor") == "" {
			_, _ = w.Write([]byte(`{"baseline":{"commit":"` + baseline + `"},"changes":[{"action":"add","collection":"pages","slug":"a","locale":"en","path":"pages/a.md","checksum":"c","content":"A"}],"next":"0.1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"baseline":{"commit":"` + baseline + `"},"changes":[{"action":"add","collection":"pages","slug":"b","locale":"en","path":"pages/b.md","checksum":"c","content":"B"}],"next":null}`))
	}))
	defer srv.Close()
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")

	out := runCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", srv.URL, "pull", "--dry-run")

	if calls != 2 || !strings.Contains(out, "pages/a.md") || !strings.Contains(out, "pages/b.md") {
		t.Errorf("calls = %d, output:\n%s", calls, out)
	}
}

func TestPullLeavesNoBranchWhenThereIsNothingToCommit(t *testing.T) {
	repo, baseline := pullRepo(t)
	t.Chdir(repo)
	t.Setenv(EnvToken, "ci-token")
	// A deletion of a file the baseline never had changes nothing, so the commit fails
	body := `{"baseline":{"commit":"` + baseline + `"},"changes":[{"action":"delete","collection":"pages","slug":"ghost","locale":"en","path":"pages/ghost.md","checksum":null,"content":null}],"next":null}`

	_, err := execCLI(t, filepath.Join(t.TempDir(), "c.json"), "--api-url", changesServer(t, body).URL,
		"pull", "--content-dir", "site/content", "--branch", "prod-pull/empty")
	if err == nil {
		t.Fatal("a pull with nothing to commit should fail")
	}
	if branches := gitIn(t, repo, "branch", "--list", "prod-pull/empty"); branches != "" {
		t.Errorf("the failed pull left a branch behind: %q", branches)
	}
}
