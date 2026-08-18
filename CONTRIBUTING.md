# Contributing — Cómo colaborar

Gracias por contribuir a este proyecto del ecosistema **SWAL**. Antes de empezar, lee:

- La **[Guía de Colaboración SWAL](../../docs/SWAL/COLLABORATION_GUIDE.md)** (canónica, administrada por Maloca) — estándares, licencia, seguridad y flujo issue→PR→merge.
- El `AGENTS.md` de este repo (reglas específicas del proyecto).
- El `README.md` para el quickstart local.
- Nuestra visión en **[GOAL.md](../../docs/SWAL/GOAL.md)**.
- El backlog global del ecosistema lo puedes consultar en el módulo **maloca**.

## Flujo

1. **Issue primero**: abre un issue con criterios de aceptación verificables (o toma uno existente). Una feature = un issue.
2. **Rama**: `feat/<issue-id>-<slug>` desde la rama de integración.
3. **Commits**: `type(scope): descripción (closes #N)` — `feat|fix|docs|test|refactor|chore|security|perf`.
4. **Calidad antes del push**:
   - Rust: `cargo fmt` + `cargo clippy --all-targets -- -D warnings` + `cargo test`.
   - Node/pnpm: script `lint` y `test` del repo.
   - **Builds a RAM**: nunca `CARGO_TARGET_DIR=/tmp/...` ni al SSD — usa `/build/rust-target/<proyecto>-<uso>`.
5. **PR**: describe qué cambia, referencia el issue (`closes #N`), asegura verificaciones verdes. PRs de agentes autónomos pasan revisión local antes del merge.
6. **Merge**: lo ejecuta Maloca (administrador) o el mantenedor tras revisión; nunca auto-merge sin revisar (GitCore process).

## No hagas

- ✅ Commitees `.env`, tokens, DBs, `target/`, `node_modules/`, logs o artefactos (gitleaks corre en CI).
- ✅ Borres archivos locales con `git rm` a secas — usa `git rm --cached` si un artefacto entró al índice.
- ✅ Reescribas historia o fuerces push sin aprobación del mantenedor.

## Seguridad

Vulnerabilidades → `SECURITY.md` (reporte privado). No hagas disclosure público antes del fix.

## Licencia

AGPL-3.0-only. Al contribuir aceptas que tu contribución queda bajo esta licencia. Recuerda aceptar el [CLA.md](CLA.md).
