# Security Triage Report

**Date:** 2026-08-18

## Audit Results
- **Critical/High Runtime Vulnerabilities:** 0
- **Dev-only Vulnerabilities:** 5 (low/moderate/high)

### Accepted Dev-Only Vulnerabilities
1. **vite (high)** - `server.fs.deny` bypass on Windows alternate paths.
   - **Impact:** Dev-only (vitepress depends on vite 5). No runtime impact.
   - **Action:** Aceptada sin fix hasta que `vitepress` actualice su dependencia interna.
2. **path-to-regexp (moderate)** - Quadratic CPU consumption.
   - **Impact:** Dev-only (vercel cli). No runtime impact.
   - **Action:** Aceptada sin fix porque actualizar a v8 rompe la API esperada por Vercel CLI.
3. **Otras vulnerabilidades menores en devDependencies**
   - **Action:** Aceptadas dado que no afectan el artefacto de producción (runtime).

## CI Gate
The CI now includes a gate for `pnpm audit --prod --audit-level=high`, preventing any regressions where a high or critical vulnerability is introduced into runtime dependencies.
