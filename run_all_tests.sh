#!/bin/bash
cd /app
pnpm install
pnpm build
cd apps/shelf-inventory
pnpm exec playwright install chromium --with-deps
xvfb-run -a pnpm test:e2e
