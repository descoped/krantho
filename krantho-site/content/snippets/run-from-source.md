---
title: Run krantho from source
sample: run-from-source
stack: any
language: bash
order: 1
status: published
---

```bash
# Needs access to the repository, which is private during development
git clone https://github.com/descoped/krantho.git
cd krantho
pnpm install
pnpm run build

# The reference example: the site on http://localhost:4002, Studio at /studio
cd examples/nextjs-shadcn
pnpm dev -p 4002
# On Node 26 the dev script fails (an open issue); run `pnpm exec next dev -p 4002`
```
