#!/usr/bin/env bash
set -euo pipefail

tools_src="$(dirname "$0")/../../../../src"

npx tsx "$tools_src/seo/enrich-faq.ts" "$@"
npx tsx "$tools_src/seo/enrich-services.ts" "$@"
npx tsx "$tools_src/seo/enrich-llms.ts" "$@"
npx tsx "$tools_src/cms/generate-meta-descriptions.ts" "$@"
