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

# Every @krantho package and create-krantho resolves to its packed tarball. The
# overrides go in pnpm-workspace.yaml, which pnpm 10 and every later pnpm read.
for pack in "$packs"/*.tgz; do
  name=$(tar -xzOf "$pack" package/package.json | jq -r .name)
  printf "  '%s': file:%s\n" "$name" "$pack"
done > "$work/overrides"
{ echo; echo 'overrides:'; cat "$work/overrides"; } >> "$site/pnpm-workspace.yaml"
manager=$(jq -r .packageManager "$root/package.json")
jq --arg m "$manager" '.packageManager = $m' "$site/package.json" > "$work/package.json"
mv "$work/package.json" "$site/package.json"

cd "$site"
pnpm install --no-frozen-lockfile

# pnpm installs a missing peer from the registry and applies no override to it:
# add each such @krantho peer as a direct dependency on its pack, and install again
peers=$(grep -Eo "^  '?@krantho/[a-z-]+@[0-9]" pnpm-lock.yaml | sed -E "s/^  '?//; s/@[0-9]$//" | sort -u)
if [ -n "$peers" ]; then
  for name in $peers; do
    pack=$(grep "'$name':" "$work/overrides" | sed 's/.*: //')
    jq --arg n "$name" --arg p "$pack" '.dependencies[$n] = $p' package.json > "$work/package.json"
    mv "$work/package.json" package.json
  done
  pnpm install --no-frozen-lockfile
fi

# The site must run on the packs, not on packages from the registry
if grep -Eq "^  '?@krantho/[a-z-]+@[0-9]" "$site/pnpm-lock.yaml"; then
  grep -E "^  '?@krantho/[a-z-]+@[0-9]" "$site/pnpm-lock.yaml"
  echo "these @krantho packages came from the registry, not the packs"; exit 1
fi

if [ "$framework" = nextjs ]; then
  pnpm exec next dev -p "$port" > "$work/server.log" 2>&1 &
else
  pnpm exec vite dev --port "$port" > "$work/server.log" 2>&1 &
fi
server=$!
trap 'status=$?; kill $server 2>/dev/null || true; wait $server 2>/dev/null || true; rm -rf "$work" 2>/dev/null || true; exit $status' EXIT

base="http://localhost:$port"
i=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/content")" != 000 ]; do
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
