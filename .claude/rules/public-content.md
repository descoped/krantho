# Public Content

The repository is public, and so is everything it publishes. What is written for the public
targets krantho, the project, and krantho.com, the site. How the maintainer runs krantho.com,
and what is on the maintainer's machine, stay private.

Public means:

- krantho.com: the site's pages, `/changelog` and the docs (`krantho-site/content/`)
- `docs/`, the READMEs and `CHANGELOG.md`
- GitHub release notes, issues, pull requests, comments and commit messages
- GitHub Actions logs and job summaries, which anyone can read on a public repository
- the packages on npm

None of them carries:

- **A person's name, handle or email.** The project speaks as krantho. A commit's author and a
  package's `author` field are git's and npm's metadata, not content.
- **The production deployment's internals.** The Vercel account or team, a deployment URL
  (`*.vercel.app`), project or team IDs, a rollback command, the database provider's project,
  region or plan, the infra stack, its variables and their values, admin emails.
- **The maintainer's machine.** Home-directory paths, local tools and their configuration,
  the notes directory's contents.

Write about krantho.com as the site, never about how it is hosted for the operator: "krantho.com
deploys on every release" is public, "the deployment at `krantho-xyz-team.vercel.app`" is not.
Those details belong to the operator's infra stack and the notes directory.

A workflow follows the same rule: secrets for anything that identifies the deployment (GitHub
masks secrets, not variables), no deployment URL or account in a log, a job summary or the
release notes, and a failing command's output shown with them removed.

A leak found is fixed where it is: edit the release notes, the page or the doc, and remove the
log of a workflow run that printed it.
