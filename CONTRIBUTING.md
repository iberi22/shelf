# CONTRIBUTING.md — How to Contribute to Shelf

**Last Updated:** 2026-08-16

---

## 🌟 Welcome

Thank you for your interest in contributing to Shelf! This document provides guidelines for contributing to the repository.

Shelf is an open-source project licensed under the GNU Affero General Public License v3.0 (`AGPL-3.0-only`). All contributors must agree to the Contributor License Agreement ([`CLA.md`](CLA.md)).

---

## 🧭 Contribution Types

| Type | Description | Process |
|------|-------------|---------|
| 🐛 Bug Report | Report a bug | Open a GitHub Issue |
| 💡 Feature Request | Propose new functionality | Open a GitHub Issue with label `enhancement` |
| 🔧 Pull Request | Submit code changes | Fork + PR with changes |
| 📖 Documentation | Improve docs | PR editing relevant doc files in `apps/docs/` or package READMEs |
| 🌐 Translations | Add/improve translations | PR in `apps/shelf-inventory/locales/` |

---

## 🚀 Development Workflow

### 1. Fork & Clone
```bash
git clone https://github.com/tu-usuario/shelf.git
cd shelf
pnpm install
```

### 2. Create a Feature Branch
```bash
git checkout -b feat/descriptive-name
```

### 3. Local Development
```bash
# Start monorepo dev mode
pnpm dev

# Lint code with Biome
pnpm lint

# Build all packages and apps
pnpm build
```

### 4. Testing
```bash
# Unit tests for specific package
pnpm --dir packages/edge-mesh test

# Run Playwright E2E tests for main inventory app
pnpm --dir apps/shelf-inventory test:e2e
```

### 5. Commit & CLA
```bash
git add .
git commit -m "feat(scope): descriptive message (closes #N)"
```
Note: All PR submissions require accepting the terms in [`CLA.md`](CLA.md).

### 6. Push & PR
```bash
git push origin feat/descriptive-name
# Open a Pull Request on GitHub
```

---

## 📋 Code Standards

- **TypeScript strict mode**: Enabled across all packages and apps.
- **Biome**: Formatter and linter enforced via pre-commit hooks and CI.
- **Accessibility & Security**: Include `aria-label` on icon-only buttons; enforce `noopener,noreferrer` on external links.
- **GitCore Protocol**: Keep feature registry (`.gitcore/features.json`), `SRC.md`, and SRS documentation updated.

---

## 🤝 Code of Conduct

- **Be respectful**: Maintain a welcoming and professional environment.
- **Constructive feedback**: Provide actionable feedback during code reviews.
- **Security awareness**: Do not commit secrets, private keys, or API credentials.

---

## 📬 Contact & Resources

- **GitHub Repository**: https://github.com/iberi22/shelf
- **Issues**: https://github.com/iberi22/shelf/issues
- **CLA**: [`CLA.md`](CLA.md)
- **License**: [`LICENSE`](LICENSE) (AGPL-3.0-only)
