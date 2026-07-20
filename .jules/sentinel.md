## 2026-07-20 - [Remove Hardcoded JWT Secret]
**Vulnerability:** A hardcoded JWT secret was present in packages/edge-mesh/src/maloca/gateway/auth.ts.
**Learning:** In order for systems deployed to production to be secure, cryptographic secrets like the JWT secret must be injected dynamically via environment variables rather than hardcoded in the codebase, preventing unauthorized token generation.
**Prevention:** Rely on standard methods like process.env to fetch secrets and only use fallback insecure secrets with a very visible console warning, mainly intended for local dev environments without setup.
