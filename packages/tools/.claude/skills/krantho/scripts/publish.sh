#!/usr/bin/env bash
set -euo pipefail
npx tsx "$(dirname "$0")/../../src/cms/publish.ts" --slug "$1"
