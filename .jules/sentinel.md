## 2026-07-25 - [XSS Fix in Catalog HTML Generator]
**Vulnerability:** XSS vulnerability in Catalog HTML Generator
**Learning:** The custom `escapeHtml` function used DOM `textContent` to escape HTML tags, but did not escape quote characters (`'` and `"`). This left HTML attributes vulnerable to injection breakouts when generating catalogs.
**Prevention:** Always explicitly escape quotes along with angle brackets when writing custom HTML escaping utilities for user input, or use an established, robust HTML escaping library.
