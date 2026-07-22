## 2024-05-18 - Prevent Hardcoded JWT Secrets in Isomorphic Edge Code
**Vulnerability:** A hardcoded `JWT_SECRET` was being used for HMAC-SHA256 token generation and verification in `packages/edge-mesh/src/maloca/gateway/auth.ts`.
**Learning:** In isomorphic/edge code (like a mesh network SDK) that can run in both browsers and Node.js-like environments (Cloudflare Workers, Deno, Node), directly accessing `process.env.SECRET` can cause `ReferenceError` crashes. However, hardcoding a secret bypasses security.
**Prevention:** We can safely retrieve secrets via `typeof (globalThis as any).process !== "undefined"` to gracefully handle environment variables without throwing errors in the browser, while optionally providing a noisy fallback to avoid breaking tests/local development silently.
