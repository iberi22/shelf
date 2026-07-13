# HEARTBEAT.md — Checklist de Heartbeat para Shelf

**Última actualización:** 2026-07-09

---

## 💓 ¿Qué es un Heartbeat?

El heartbeat es una verificación periódica del estado del proyecto. Se ejecuta al inicio de cada sesión de trabajo significativa o al menos una vez por semana.

---

## ✅ Checklist de Heartbeat

### 1. Estado del Repositorio
- [ ] `git status` — sin cambios no commiteados inesperados
- [ ] `git log --oneline -5` — últimos commits tienen formato válido
- [ ] Branch actual es el correcto (feature branch, no `main`)
- [ ] Sin merge conflicts pendientes

### 2. Dependencias
- [ ] `pnpm install` — lockfile actualizado
- [ ] Sin vulnerabilidades conocidas (`pnpm audit`)
- [ ] `pnpm-lock.yaml` sincronizado con `package.json`

### 3. Build
- [ ] `pnpm build` — compila sin errores
- [ ] `pnpm lint` — Biome no reporta errores nuevos
- [ ] TypeScript strict: `npx tsc --noEmit` pasa

### 4. Tests
- [ ] Tests unitarios principales pasan
- [ ] Tests E2E de edge-mesh pasan (con PeerServer corriendo)
- [ ] Tests de UI con Cypress pasan (si aplica)

### 5. Archivos de Configuración
- [ ] `turbo.json` — coherente con estructura actual
- [ ] `vercel.json` — configuración actualizada
- [ ] `.env.example` — refleja variables reales
- [ ] `.gitignore` — cubre todos los artifacts generados

### 6. GitCore / Harness
- [ ] `.gitcore/features.json` — features reflejan estado real
- [ ] `AGENTS.md`, `SOUL.md`, `USER.md` — información actualizada
- [ ] `TASK.md` — tareas reflejan trabajo real
- [ ] `MEMORY.md` — decisiones recientes registradas

### 7. Paquetes (@shelf/*)
- [ ] `packages/*/package.json` — versiones coherentes
- [ ] Cada package tiene README actualizado
- [ ] Public API documentada en `src/index.ts`

### 8. CI/CD
- [ ] GitHub Actions pasan en `main`
- [ ] Vercel previews funcionan
- [ ] Dependabot configurado y activo

---

## 🚨 Señales de Alerta

| Síntoma | Acción |
|---------|--------|
| Build falla en `main` | ⛔ Detener desarrollo, arreglar inmediatamente |
| Tests E2E rotos | 🔴 Prioridad máxima, son la primera línea de defensa |
| PeerServer no responde en :9000 | 🟡 Verificar que el proceso esté corriendo |
| Biome reporta errores | 🟡 `biome check --write` antes de continuar |
| `package.json` con versiones inconsistentes | 🟡 Revisar pnpm-lock.yaml |
| Features desactualizados en `.gitcore/` | 🟡 Actualizar features.json |

---

## 📋 Log de Heartbeats

| Fecha | Estado | Notas |
|-------|--------|-------|
| 2026-07-09 | ✅ | Proyecto estable, 21/21 features, edge-mesh activo |
