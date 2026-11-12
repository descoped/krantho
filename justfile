# krantho — local development task runner
# Install: brew install just

# Show available recipes
default:
    @just --list

# Build the package
build:
    pnpm run build

# Type-check without emitting
typecheck:
    pnpm run typecheck

# Start TypeScript watch mode
dev:
    pnpm run dev

# Run all tests once
test:
    pnpm run test:run

# Run tests in watch mode
test-watch:
    pnpm run test

# Run tests with coverage
test-coverage:
    pnpm run test:coverage

# Run all quality checks (format, lint, build, typecheck)
check:
    pnpm run format:check
    pnpm run lint
    pnpm run build
    pnpm run typecheck

# Auto-format code with Biome
format:
    pnpm run format

# Run the Biome linter: lint rules and import order
lint:
    pnpm run lint

# Run test by name pattern (e.g., just test-filter "Content Engine")
test-filter PATTERN:
    pnpm run test -- -t "{{PATTERN}}"

# Clean build artifacts
clean:
    pnpm run clean

# Install dependencies
install:
    pnpm install

# Install with frozen lockfile (CI mode)
install-ci:
    pnpm install --frozen-lockfile

# --- SEO CLI (archetype-driven) ---

# Show all SEO archetype configurations
seo-config:
    pnpm run seo config show

# Set site-level Schema.org type
seo-set-site TYPE:
    pnpm run seo config set-site {{TYPE}}

# Set collection archetype types
seo-set COLLECTION TYPES:
    pnpm run seo config set {{COLLECTION}} {{TYPES}}

# Validate rich result eligibility
seo-validate:
    pnpm run seo validate --all

# Remove all SEO configurations (clean slate)
seo-clean:
    pnpm run seo config clean

# --- SEO Legacy (deterministic, no AI) ---

# Generate structured-data.json + faq-pages.json
seo-generate:
    pnpm run seo:generate

# Generate llms.txt link descriptions
seo-enrich-llms:
    pnpm run seo:enrich:llms

# --- Krantho Site (krantho-site/) ---

# Start krantho site dev server
site-dev:
    cd krantho-site && pnpm dev

# Build krantho site for production
site-build:
    cd krantho-site && pnpm build

# Start krantho site production server
site-start:
    cd krantho-site && pnpm start

# Clear Turbopack / Next.js / SvelteKit / Vite dev caches from all examples and sites
clear-dev-cache:
    #!/usr/bin/env bash
    for dir in examples/*/ krantho-site/; do
        [ -d "$dir" ] || continue
        rm -rf "$dir/.next" "$dir/.svelte-kit" "$dir/node_modules/.vite" 2>/dev/null
        name=$(basename "$dir")
        echo "  cleared $name"
    done
    echo "Dev caches cleared."

# --- Studio ---

# Build Studio (required before serving examples with Studio)
studio-build:
    pnpm --filter @krantho/studio run build

# --- Examples ---

# Start individual example with API + Studio
serve-nextjs-shadcn:
    cd examples/nextjs-shadcn && pnpm dev -p 4002

serve-nextjs-mui:
    cd examples/nextjs-mui && pnpm dev -p 4001

serve-sveltekit-shadcn:
    cd examples/sveltekit-shadcn && pnpm dev --port 4004

serve-sveltekit-tw:
    cd examples/sveltekit-tailwind && pnpm dev --port 4003

serve-ssr:
    cd examples/react-ssr && pnpm dev --port 4005

serve-spa:
    cd examples/react-spa && pnpm dev --port 4006

serve-site:
    cd krantho-site && pnpm dev --port 4010

# Start all example dev servers (ports 4001-4006)
examples-dev:
    #!/usr/bin/env bash
    cd examples/nextjs-mui && pnpm dev -p 4001 &
    cd examples/nextjs-shadcn && pnpm dev -p 4002 &
    cd examples/sveltekit-tailwind && pnpm dev --port 4003 &
    cd examples/sveltekit-shadcn && pnpm dev --port 4004 &
    cd examples/react-ssr && pnpm dev --port 4005 &
    cd examples/react-spa && pnpm dev --port 4006 &
    echo "Examples running:"
    echo "  nextjs-mui         → http://localhost:4001"
    echo "  nextjs-shadcn      → http://localhost:4002"
    echo "  sveltekit-tailwind → http://localhost:4003"
    echo "  sveltekit-shadcn   → http://localhost:4004"
    echo "  react-ssr          → http://localhost:4005"
    echo "  react-spa          → http://localhost:4006"
    echo ""
    echo "Stop with: just examples-stop"
    wait

# Stop all example dev servers
examples-stop:
    #!/usr/bin/env bash
    for port in 4001 4002 4003 4004 4005 4006 4010; do
        pid=$(lsof -ti :$port 2>/dev/null)
        if [ -n "$pid" ]; then
            kill $pid 2>/dev/null && echo "Stopped server on port $port (pid $pid)"
        fi
    done
