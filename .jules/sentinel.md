## 2024-05-24 - [XSS via Incomplete HTML Escaping]
**Vulnerability:** The `escapeHtml` function relied on `div.textContent = text; return div.innerHTML;`, which escapes `<` and `>` but leaves single and double quotes unescaped. This allowed for Cross-Site Scripting (XSS) when the output was used within HTML attributes (e.g., `src` or `alt`).
**Learning:** Native DOM properties like `textContent` and `innerHTML` are insufficient for full HTML escaping, particularly for attributes.
**Prevention:** Always explicitly escape quotes (`"` to `&quot;` and `'` to `&#39;`) in addition to using native DOM methods, or use a robust, dedicated HTML escaping library.
