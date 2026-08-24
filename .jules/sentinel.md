# Sentinel: Security Vulnerability Remediation Agent Framework

## Objectives
- Detect and fix security vulnerabilities, including XSS, Tabnabbing, and insecure payload handling.
- Verify that every fix is accompanied by tests and respects project coding guidelines.
## 2026-08-01 - Error Details Leakage
**Vulnerability:** In `apps/shelf-inventory/api/ai/chat.ts`, the AI chat endpoint was leaking sensitive configuration details and upstream error responses directly to the client in the event of an error. Specifically, it leaked whether `OPENROUTER_API_KEY` was configured on the server, and returned the full upstream error text (which could include API keys, internal paths, or prompt details). It also leaked stack traces in the catch block (`error.message`).
**Learning:** Exposing detailed upstream errors or internal state information directly to clients via API endpoints creates an information leakage vulnerability, violating the "fail securely" principle.
**Prevention:** Catch external dependency errors, log them securely on the server side using generic messages for client responses (e.g., 'Service Error' or 'Internal Server Error' instead of 'OPENROUTER_API_KEY is not configured'). Never pass `error.message` directly in a generic catch block.
