# Changelog

## [1.3.0] - 2026-06-01

### Added
- **Nuevos campos en productos**: `color`, `dimensions`, `capacity`, `material`
  - `types.ts`: Interfaz `Product` extendida con los 4 campos opcionales
  - `Inventory.tsx`: Formulario con inputs para color, medidas, capacidad y material
  - `Inventory.tsx`: Tabla desktop con columnas sortables para los nuevos campos
  - `Inventory.tsx`: Tarjetas mobile con badge visual para color, medidas, capacidad y material
  - `Inventory.tsx`: CSV export incluye los nuevos campos como columnas adicionales
  - `Inventory.tsx`: Búsqueda ahora filtra también por color, material, dimensiones y capacidad
  - `Catalog.tsx`: Vista previa y HTML export muestran los nuevos campos con emojis
  - `locales/*.json`: Traducciones para ES, EN, PT

### Fixed
- **UpdateNotification**: Mensaje de actualización ahora muestra "Nueva versión disponible: vX.X.X" con fecha de publicación
- **Service Worker**: Auto-check cada hora, notificación con botones "Actualizar ahora" y "Más tarde"
- **Login modal**: Corregido keys extraños ("AUTH.OR" y "auth.loginGuest") que aparecían por cache de PWA
