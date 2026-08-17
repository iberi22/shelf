## 2025-02-27 - [Fix XSS from missing quote escaping in escapeHtml utility]
**Vulnerability:** XSS vulnerability in `escapeHtml` where it did not escape single and double quotes, only escaping `<` and `>` through DOM `textContent` -> `innerHTML` assignment.
**Learning:** Using `div.textContent = text; return div.innerHTML` is insufficient for preventing HTML attribute injection since standard text escaping does not sanitize quotation marks (`"` and `'`).
**Prevention:** Avoid relying solely on native DOM assignments for full HTML escaping. Explicitly replace/sanitize quotes (`"`, `'`) or use a robust library if using the result inside attributes.

## 2024-03-24 - Removed Hardcoded JWT Secret in Edge Mesh Authentication
**Vulnerability:** A hardcoded `JWT_SECRET` (`'maloca-gateway-default-secret-change-me'`) was found in `packages/edge-mesh/src/maloca/gateway/auth.ts`, allowing anyone with access to the source code to forge JWTs and impersonate profiles.
**Learning:** Hardcoded secrets should never be used, especially for signing JSON Web Tokens which establish identity in cross-platform (edge/browser) systems.
**Prevention:** Keys should be loaded securely from environment variables, avoiding exceptions when missing by verifying `typeof globalThis.process !== 'undefined'`. A cryptographically secure random value (`crypto.getRandomValues`) should be used as a fallback accompanied by a console warning.

 ## 2025-02-27 - [Fix XSS vulnerability in Catalog image rendering]
 **Vulnerability:** XSS vulnerability in `apps/shelf-inventory/components/Catalog.tsx` where an unescaped `product.imageUrl` was directly interpolated into the `src` attribute of an `<img>` tag in a template literal meant for HTML document generation.
 **Learning:** Even if primary identifiers or names are correctly escaped (e.g., `escapeHtml(product.name)`), secondary fields like `imageUrl` that are used inside attributes (such as `src`) must also be explicitly sanitized to prevent attribute injection payloads (e.g., `"><script>alert(1)</script>`).
 **Prevention:** Ensure all user-controlled data interpolated into raw HTML string templates, especially when building documents for export (like PDF/HTML generation), passes through `escapeHtml` or an equivalent robust HTML sanitization utility.
 ## 2025-02-27 - [Fix timing attack vulnerability in HMAC signature verification]
 **Vulnerability:** HMAC signature validation logic for both JWTs (`packages/edge-mesh/src/maloca/gateway/auth.ts`) and webhook signatures (`apps/shelf-inventory/api/webhooks/*.ts`) manually derived a hash and used standard JavaScript string equality (`===`) to compare the expected base64-encoded hash with the received base64-encoded signature. This is vulnerable to timing attacks since the V8 engine stops comparing strings as soon as it finds a mismatch, leaking the length of the matching prefix and allowing attackers to forge signatures.
 **Learning:** Checking signatures with standard equality operators (`===`) creates timing side-channels.
 **Prevention:** Always use Web Crypto API's constant-time comparison methods. Instead of deriving the signature using `crypto.subtle.sign` and manually comparing it with `===`, use `crypto.subtle.verify` which is designed to prevent timing attacks.

## 2025-02-27 - [Fix weak PRNG usage for ID generation]
**Vulnerability:** Weak PRNG (`Math.random()`) was used for generating critical identifiers like transaction IDs, event keys, connection IDs, and envelope nonces/IDs throughout the `edge-mesh` package.
**Learning:** `Math.random()` is not cryptographically secure, which means its sequence can potentially be predicted, leading to ID collisions, replay attacks, or spoofing in a P2P context.
**Prevention:** In edge/browser environments, always use the Web Crypto API (`crypto.getRandomValues()`) or `crypto.randomUUID()` to generate unpredictable nonces and unique identifiers. A `secureRandomString()` utility function has been created to replace weak random sequences.

## 2026-08-13 - [Fix Math.random ID generation and window.open tabnabbing vulnerabilities]
**Vulnerability:** Weak PRNG (`Math.random()`) was used in fallbacks for candidate proposal IDs, task IDs, and variant draft IDs in shelf components. Additionally, frontend UI elements utilized `window.open` targeting `_blank` without passing `noopener,noreferrer`, exposing users to reverse tabnabbing attacks.
**Learning:** Standardizing ID generation across the core/app layers using cryptographically secure PRNG fallbacks (`crypto.getRandomValues()`) prevents predictable sequence exploitation. Securing target UI redirect links with `'noopener,noreferrer'` features prevents parent window reference hijacking from open tabs.
**Prevention:** Always verify that core consensus and model builders employ secure random buffers (`crypto.getRandomValues`) for sequential fallbacks instead of `Math.random()`. Secure all client-side page redirects / web links opening in new tabs by specifying `'noopener,noreferrer'`.

## 2026-08-13 - [Fix timing attack in PBKDF2 hash verification]
**Vulnerability:** In `packages/p2p-mesh-core/src/crypto.ts`, `verifyPassword` used a strict equality operator (`===`) to compare the derived password hash with the stored hash, which makes it vulnerable to timing attacks as string comparisons exit early on mismatches.
**Learning:** Checking hashes and passwords using standard string equality leaks information about the length of matching characters.
**Prevention:** Use a constant-time secure comparison algorithm that iterates over the full length of the shortest string (or handles length checks in constant time) to verify password hashes.

## 2026-08-13 - [Analyzed Math.random in P2P Mesh Gossip]
**Vulnerability:** Found `Math.random()` usage in `packages/edge-mesh/src/mesh/index.ts`.
**Learning:** Evaluated its usage (`fanOutIndex` generation and array sorting for peer selection). Because these only affect gossip routing (jitter and random subset selection) and are not used for security-sensitive operations like nonce/key generation, they do not introduce a security vulnerability.
**Prevention:** Only replace `Math.random()` with `crypto.getRandomValues()` when the randomness is security-critical to avoid unnecessary performance overhead in standard shuffling/jitter functions.

## 2026-08-16 - [Add rate limiting and validation to public AI API endpoint]
**Vulnerability:** The `/api/ai/chat.ts` endpoint was exposed without any rate limiting, payload size constraints, or input validation. Because this endpoint proxies requests to a paid external API (OpenRouter) using a server-side secret key, an attacker could abuse it to cause resource exhaustion or run up significant billing costs.
**Learning:** Public-facing API routes that proxy requests to paid services must have defensive constraints in place, even if they aren't fully authenticated.
**Prevention:** Always implement rate limiting (e.g., using `TokenBucketRateLimiter` keyed by IP), payload size limits (e.g., 50KB), and strict input validation (checking required fields and maximum string lengths) on unauthenticated or lightly authenticated API endpoints.
