# SRC-FUN-010: Multi-language Support

- **ID:** SRC-FUN-010
- **Nombre:** Multi-language Support
- **Prioridad:** P1 (Importante)
- **Estado:** ✅ Implemented
- **Implementation:** 90%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

## Descripción
Soporte multi-idioma con traducción completa de UI en Inglés, Español y Portugués. Preferencia persistida en localStorage.

## Actor Principal
Usuario Free

## Dependencias
Ninguna

## User Story
> Como usuario, quiero usar la app en mi idioma.

## Acceptance Criteria
1. Toggle de idioma en settings: English, Español, Português
2. Traducción completa de toda la UI
3. Persistencia de preferencia de idioma (localStorage)
4. Sistema de traducción vía archivos de locales JSON

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI con i18n |
| localStorage | Persistencia de preferencia |
| JSON locale files | Traducciones |

## Idiomas Soportados
| Código | Idioma | Archivo |
|--------|--------|---------|
| en | English | locales/en.json |
| es | Español | locales/es.json |
| pt | Português | locales/pt.json |

## Detalles Técnicos
- **Sistema:** Custom i18n con Context API (sin dependencias externas)
- **Fallback:** Inglés como default si falta traducción
- **Persistencia:** `shelf:language` en localStorage
- **Extensible:** Agregar nuevo idioma = crear nuevo JSON locale

## Commits Relacionados
```
feat(i18n): implement SRC-FUN-010 - multi-language support (EN/ES/PT)
```
