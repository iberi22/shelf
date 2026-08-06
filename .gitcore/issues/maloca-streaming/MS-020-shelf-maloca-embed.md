# [MS-020] — Embed Maloca module in Shelf admin dashboard (maloca-streaming · shelf)

| % validado | Estado | Repos | Refs | Prioridad | Esfuerzo |
|:---|:---|:---|:---|:---|:---|
| 0% | open | shelf | | P2 | 2 days |

## Visión
Integrar el ecosistema de Maloca directamente en el backoffice de Shelf, que sirve como nuestro candidato principal de piloto MVP dado su estado actual de completitud (~87.5%). Esto proporcionará visibilidad en tiempo real de las métricas de progreso de GitCore, decisiones de arquitectura y backlog del producto sin necesidad de cambiar de contexto.

## Scope
- Añadir una nueva pestaña 'Maloca' en la interfaz de administración (Admin UI) de Shelf.
- Importar y renderizar el paquete `@swal/maloca-embed` (MS-016).
- Inicializar el módulo con la configuración `app_id='shelf'`.
- Mostrar el resumen del backlog extrayendo los datos desde el archivo `features.json` de Shelf.
- Incluir un _badge_ visual con el _score_ de implementación de GitCore (actualmente 87.5%).
- Renderizar la lista de decisiones arquitectónicas recientes y el _feed_ de commits que afectan al entorno de Shelf.
- Habilitar un enlace de redirección hacia el backoffice completo de Maloca.

## Aceptación
- [ ] La UI de administrador de Shelf contiene un panel accesible bajo la pestaña 'Maloca'.
- [ ] El componente `@swal/maloca-embed` se carga exitosamente sin errores de red.
- [ ] El contexto se inicializa correctamente usando `app_id='shelf'`.
- [ ] El resumen del backlog lee exitosamente los nodos de `features.json` y los muestra.
- [ ] El GitCore implementation score (87.5%) se visualiza en formato de _badge_ de estado.
- [ ] Los flujos de decisiones y feed de commits se actualizan dinámicamente.

## Archivos
- `src/admin/components/MalocaTab.tsx`
- `src/admin/routes.ts`
- `package.json`

## Dependencias
- [MS-016] — Maloca MS-016 (@swal/maloca-embed package)

## Verificación
Arrancar el servidor de desarrollo de Shelf, navegar a la ruta `/admin/maloca`, y validar visualmente la renderización correcta de todos los widgets (backlog, scores, decisiones, commits) inyectados por el módulo embed.
