# SRC-FUN-006: Barcode/QR Scanner

- **ID:** SRC-FUN-006
- **Nombre:** Barcode/QR Scanner
- **Prioridad:** P1 (Importante)
- **Estado:** ✅ Implemented
- **Implementation:** 90%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

## Descripción
Escaneo de códigos de barras y QR usando la cámara del dispositivo para entrada rápida de SKU sin escritura manual.

## Actor Principal
Vendedor / Cajero / Usuario de Bodega

## Dependencias
- **SRC-FUN-001** (Inventory Management) — vincula SKU escaneado a producto

## User Story
> Como usuario de bodega, quiero escanear códigos de barras para no escribir SKUs manualmente.

## Acceptance Criteria
1. Escaneo usando cámara del dispositivo (html5-qrcode)
2. Parseo automático de código de barras a campo SKU
3. Soporte para QR y códigos de barras estándar (EAN, UPC, Code128)
4. Feedback visual de escaneo exitoso

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| html5-qrcode | Librería de escaneo QR/barcode |
| React 19 | Integración en UI |
| Cámara Web | Captura de video para escaneo |

## Detalles Técnicos
- **Permisos:** Solicita acceso a cámara solo cuando se activa el scanner
- **Formatos:** EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39, QR
- **Feedback:** Vibración + sonido + check visual al escanear exitosamente
- **Fallback:** Input manual de SKU si la cámara no está disponible

## Commits Relacionados
```
feat(scanner): implement SRC-FUN-006 - barcode/QR scanner
```
