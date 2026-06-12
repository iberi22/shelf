# SRC-FUN-007: AI Assistant

- **ID:** SRC-FUN-007
- **Nombre:** AI Assistant
- **Prioridad:** P2 (Nice to have)
- **Estado:** ✅ Implementado (gated: Pro)
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Asistente IA para análisis de inventario y preguntas en lenguaje natural usando Gemini API. Gated para usuarios del plan Pro.

## Actor Principal
Usuario Pro

## Dependencias
- **SRC-FUN-008** (Auth & Cloud Sync) — requiere autenticación Pro
- **SRC-FUN-001** (Inventory Management) — contexto de datos

## User Story
> Como usuario Pro, quiero preguntarle a un AI sobre mi inventario en lenguaje natural.

## Acceptance Criteria
1. Interfaz de chat integrada en reports page
2. Gemini API vía Firebase Cloud Function (proxy)
3. Gated: solo visible para usuarios Pro
4. Capacidad de responder preguntas sobre datos de inventario, ventas, tendencias

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| @google/genai | Gemini API SDK |
| Firebase Cloud Functions | Proxy para API key |
| React 19 | UI de chat |

## Detalles Técnicos
- **Proxy:** Firebase Cloud Function protege la API key de Gemini
- **Contexto:** El asistente recibe contexto del inventario/ventas actual
- **Límites:** Rate limiting vía Cloud Functions para evitar abuso
- **Privacidad:** No se envían datos personales, solo métricas agregadas

## Commits Relacionados
```
feat(ai): implement SRC-FUN-007 - AI assistant with Gemini
```
