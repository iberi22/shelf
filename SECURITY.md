# SECURITY.md — Security Policy — Shelf

**Last Updated:** 2026-08-16

---

## 🔒 Security Posture

Shelf is a decentralized, offline-first inventory and point-of-sale platform. Security is integral to our architecture:

- **Post-Quantum Cryptography**: ML-KEM-768 key encapsulation and ML-DSA-65 digital signatures.
- **Encryption at Rest & Transit**: AES-GCM encryption for local storage and WebRTC peer-to-peer communication.
- **Offline-First & Local Auth**: Authentication managed locally (`localAuth`) without depending on external centralized auth servers.
- **Pro Security Model**: SWAL node heartbeat and identity verification (no external credit card paywalls or third-party payment processors).

---

## 🐛 Reporting a Vulnerability

If you discover a security vulnerability in Shelf:

### 1. Do NOT open a public issue
Security vulnerabilities must **not** be reported in public GitHub Issues.

### 2. Contact direct security maintainers
**Email**: brahyan@iberi22.com (or BELA's email on GitHub profile)

### 3. Provide Details
Include in your report:
- Vulnerability type
- Steps to reproduce
- Potential impact
- Affected component / workspace
- Suggested fix (if available)

### 4. Response Time
- **Receipt Confirmation**: < 48 hours
- **Initial Evaluation**: < 5 business days
- **Security Patch**: Severity dependent

---

## 🛡️ Security Practices

### For Developers
1. **No secrets in commits**: `.env` is strictly gitignored.
2. **Code Review**: Every PR requires review before merging.
3. **Automated Audits**: `pnpm audit --audit-level=high` enforced in CI.
4. **Static Analysis & Linting**: Biome linter detects unsafe patterns and tabnabbing risks.

### For Users
1. **Use Strong Local Passwords / App PINs**.
2. **Keep Backups Encrypted**: Use the built-in AES-encrypted backup feature in Settings.
3. **Maintain Device Security**: Ensure device OS is updated.

---

## 🔐 Security Stack

| Layer | Technology | Purpose |
|------|-----------|-----------|
| Local Auth | localAuth (PBKDF2 / Argon2 + local hashes) | Offline-first local login & device lock |
| At-Rest Encryption | AES-GCM + PIN / Seed derivation | Local data protection |
| In-Transit Encryption | WebRTC AES-GCM over PeerJS | Secure P2P communication |
| Post-Quantum Signatures | ML-DSA-65 & ML-KEM-768 | High-assurance signature & key exchange |
| Pro Verification | SWAL Node Mesh Heartbeat | Node identity and stake verification |
| Dependency Governance | `pnpm.overrides` + audit-gate | Vulnerability mitigation |

---

## 📬 Contact

**Security Contact**: brahyan@iberi22.com
**GitHub Security**: https://github.com/iberi22/shelf/security
