#!/bin/sh
# Installs the packages as npm would serve them into a project create-krantho
# generates, outside the workspace, and checks that its site, API and Studio
# answer. The workspace links and bundles its own packages, so only an install
# like this one meets what a user meets: Node's own resolver, pnpm's strict
# layout and the files each package publishes.
#
# Usage: sh scripts/check-packed-install.sh <nextjs|sveltekit> (after pnpm run build)
set -eu

framework=${1:?usage: check-packed-install.sh <nextjs|sveltekit>}
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
port=4199
packs="$work/packs"
site="$work/site"
mkdir -p "$packs"

for dir in "$root"/packages/*/; do
  [ "$(jq -r '.private // false' "$dir/package.json")" = "true" ] && continue
  (cd "$dir" && pnpm pack --pack-destination "$packs" >/dev/null)
done

node --input-type=module - "$root" "$site" "$framework" "$port" <<'EOF'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const [root, site, framework, port] = process.argv.slice(2)
const { generateFiles } = await import(join(root, 'packages/create-krantho/dist/scaffold.js'))
const files = generateFiles({
  name: 'site', framework, ui: 'plain', auth: false, seo: true,
  sampleContent: true, packageManager: 'pnpm', port: Number(port),
})
for (const [path, content] of files) {
  mkdirSync(dirname(join(site, path)), { recursive: true })
  writeFileSync(join(site, path), content)
}
EOF

# Every @krantho package and create-krantho resolves to its packed tarball
overrides=$(for pack in "$packs"/*.tgz; do
  tar -xzOf "$pack" package/package.json | jq --arg f "file:$pack" '{(.name): $f}'
done | jq -s add)
manager=$(jq -r .packageManager "$root/package.json")
jq --argjson o "$overrides" --arg m "$manager" '.pnpm.overrides = $o | .packageManager = $m' \
  "$site/package.json" > "$work/package.json"
mv "$work/package.json" "$site/package.json"

cd "$site"
pnpm install --no-frozen-lockfile

if [ "$framework" = nextjs ]; then
  pnpm exec next dev -p "$port" > "$work/server.log" 2>&1 &
else
  pnpm exec vite dev --port "$port" > "$work/server.log" 2>&1 &
fi
server=$!
trap 'kill $server 2>/dev/null || true' EXIT

base="http://localhost:$port"
i=0
until curl -s -o /dev/null "$base/api/content"; do
  i=$((i + 1))
  [ $i -lt 60 ] || { cat "$work/server.log"; echo "the site did not start"; exit 1; }
  sleep 2
done

failed=0
for path in / /api/content /studio; do
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 "$base$path")
  echo "$status $path"
  [ "$status" = 200 ] || failed=1
done
asset=$(curl -s "$base/studio" | grep -o '/studio/assets/[^"]*\.js' | head -1)
status=$(curl -s -o /dev/null -w '%{http_code}' "$base$asset")
echo "$status ${asset:-(no Studio asset in the page)}"
[ -n "$asset" ] && [ "$status" = 200 ] || failed=1

[ $failed = 0 ] || { cat "$work/server.log"; exit 1; }
