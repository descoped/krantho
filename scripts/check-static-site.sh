#!/bin/sh
# Builds a static krantho site (create-krantho's nextjs-static) the way its GitHub
# Pages workflow does for a project site, and checks the files it writes: every
# page as a folder under the site's path, the 404 page, the sitemap with each
# page dated by its last commit, llms.txt, the structured data, and links in
# the markdown under the site's path.
#
# Usage: sh scripts/check-static-site.sh <site directory> (dependencies installed)
set -eu

site=${1:?usage: check-static-site.sh <site directory>}
cd "$site"

# The pages are dated by their last commit, as in a full checkout
git init -q -b main
git -c user.email=check@example.com -c user.name=check add -A
GIT_COMMITTER_DATE=2025-04-05T06:07:08Z git -c user.email=check@example.com -c user.name=check \
  -c commit.gpgsign=false commit -q -m site --date=2025-04-05T06:07:08Z

KRANTHO_SITE_BASE_URL=https://example.github.io/site pnpm exec next build

failed=0
check() {
  if grep -q -- "$2" "out/$1"; then
    echo "ok   $1 has $2"
  else
    echo "FAIL $1 lacks $2"
    failed=1
  fi
}

for file in index.html writing/index.html publishing/index.html 404.html sitemap.xml llms.txt robots.txt; do
  [ -f "out/$file" ] || { echo "FAIL out/$file is missing"; failed=1; }
done
check index.html '/site/_next/'
check index.html 'href="/site/writing/">How to write a page'
check writing/index.html 'href="/site/publishing/"'
check writing/index.html '"TechArticle"'
check writing/index.html '"WebSite"'
check writing/index.html 'rel="canonical" href="https://example.github.io/site/writing/"'
check sitemap.xml '<loc>https://example.github.io/site/writing/</loc>'
check sitemap.xml '<lastmod>2025-04-05T06:07:08.000Z</lastmod>'
check llms.txt '(https://example.github.io/site/publishing/)'
check 404.html '/site/_next/'

[ $failed = 0 ] || exit 1
echo "the static site builds"
