## 2026-07-29 - [HIGH] Prevent XSS attribute breakout in escapeHtml
**Vulnerability:** Custom `escapeHtml` function only encoded HTML tags (`<`, `>`) using DOM `textContent` / `innerHTML`, but failed to encode single and double quotes. This left HTML attributes open to injection attacks.
**Learning:** Relying purely on native DOM assignment for string sanitization is unsafe if the output is used in an HTML attribute context.
**Prevention:** Explicitly apply `.replace(/'/g, '&#39;').replace(/"/g, '&quot;')` in custom escape functions or use standard libraries for context-aware HTML encoding.
