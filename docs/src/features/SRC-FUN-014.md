# SRC-FUN-014: Data Import (CSV)

- **ID:** SRC-FUN-014
- **Nombre:** Data Import (CSV)
- **Prioridad:** P2 (Nice to have)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Importación de inventario desde archivos CSV con parseo automático de columnas, validación de datos y feedback visual del proceso.

## Actor Principal
Usuario de Bodega

## Dependencias
- **SRC-FUN-001** (Inventory Management) — destino de los datos importados

## User Story
> Como usuario con inventario existente, quiero importarlo desde un archivo CSV.

## Acceptance Criteria
1. Upload de archivo CSV
2. Parseo y mapeo de columnas automático
3. Validación de datos importados (errores visibles)
4. Feedback visual del progreso de importación

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 | UI de importación |
| File API | Lectura de archivo CSV |
| Papaparse / custom parser | Parseo CSV |

## Detalles Técnicos
- **Columnas esperadas:** name, sku, quantity, price, cost
- **Mapeo flexible:** Detecta columnas por nombre (case-insensitive)
- **Validación:** Muestra errores por fila (SKU duplicado, cantidad negativa, etc.)
- **Rollback:** Si hay errores críticos, no importa nada
- **Progreso:** Barra de progreso para archivos grandes

## Commits Relacionados
```
feat(import): implement SRC-FUN-014 - CSV data import
```
