#!/usr/bin/env bash
set -euo pipefail
npx tsx "$(dirname "$0")/../../src/cms/validate.ts" "$@"
