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

# An image in public/ and a page that shows it: the build makes its copies
mkdir -p public
node --input-type=module - <<'PNG'
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes) => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc(body))
  return Buffer.concat([length, body, check])
}
const width = 600
const height = 300
const header = Buffer.alloc(13)
header.writeUInt32BE(width, 0)
header.writeUInt32BE(height, 4)
header.set([8, 2, 0, 0, 0], 8)
const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])
const pixels = Buffer.concat(Array.from({ length: height }, () => row))
writeFileSync(
  'public/diagram.png',
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
)
PNG
printf '\n![Diagram](/diagram.png)\n' >> content/docs/writing.md

# The pages are dated by their last commit, as in a full checkout
git init -q -b main
git -c user.email=check@example.com -c user.name=check add -A
GIT_COMMITTER_DATE=2025-04-05T06:07:08Z git -c user.email=check@example.com -c user.name=check \
  -c commit.gpgsign=false commit -q -m site --date=2025-04-05T06:07:08Z

KRANTHO_SITE_BASE_URL=https://example.github.io/site pnpm exec next build

failed=0
check() {
  if grep -qF -- "$2" "out/$1"; then
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
check writing/index.html '<source type="image/avif" srcset="/site/_krantho/images/diagram-320.avif 320w, /site/_krantho/images/diagram-480.avif 480w, /site/_krantho/images/diagram-600.avif 600w"'
check writing/index.html '<img src="/site/diagram.png" alt="Diagram" width="600" height="300" decoding="async">'
for file in _krantho/images/diagram-480.avif _krantho/images/diagram-600.webp; do
  [ -f "out/$file" ] || { echo "FAIL out/$file is missing"; failed=1; }
done

[ $failed = 0 ] || exit 1
echo "the static site builds"
