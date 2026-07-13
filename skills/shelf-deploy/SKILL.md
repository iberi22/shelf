# SKILL.md — shelf-deploy

**Skill:** Deploy y CI/CD de Shelf
**Versión:** 1.0.0

---

## 📋 Descripción

Gestión de deploys, CI/CD pipelines, y configuración de infraestructura para Shelf.

## 🛠️ Herramientas

- Vercel (hosting + previews)
- GitHub Actions (CI/CD)
- Firebase (auth, cloud functions)
- Stripe (webhooks)
- Dependabot (seguridad)

## 📂 Alcance

| Área | Ruta |
|------|------|
| Config Vercel | `vercel.json` |
| GitHub Workflows | `.github/workflows/` |
| Dependabot | `.github/dependabot.yml` |
| Env example | `.env.example` |
| Vercel project | `.vercel/` |

## 🎯 Tareas Comunes

```bash
# Deploy preview
vercel

# Deploy production
vercel --prod

# CI local (simular GitHub Actions)
pnpm build && pnpm lint
```

## 📌 Pipeline CI/CD

```yaml
PR → GitHub Actions (lint + build + test) → Auto-merge → Vercel Preview
                                                              ↓
main merge → GitHub Actions → Vercel Production
```

## 📌 Configuración Vercel

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/shelf-inventory/dist"
}
```
