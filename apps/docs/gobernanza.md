# Gobernanza de Datos y Permisos

En una arquitectura descentralizada sin "backend central" de autoridad, la gobernanza de datos debe residir en el nivel de consenso P2P.

## El "Admin" (Host)

El dispositivo que inicializa el ecosistema Shelf (crea la sala o "mesh") asume el rol de **Admin**. Este administrador tiene la autoridad para modificar los permisos de los nodos que se unen.

Cuando un empleado se une escaneando el código QR, su nivel de acceso predeterminado es limitado y depende del estado interno `PeerPermissions`.

## Permisos Granulares

El Admin puede configurar qué módulos y capacidades están disponibles para cada peer remoto en tiempo real:

- `canViewSales` / `canEditSales`
- `canViewProducts` / `canEditProducts`
- `canViewClients` / `canEditClients`
- `canViewSuppliers` / `canEditSuppliers`
- `canViewPurchaseOrders` / `canEditPurchaseOrders`
- `canViewReports` / `canViewDashboard` / `canViewArqueo`

Si un usuario no tiene `canEditProducts`, los botones para agregar o modificar inventario desaparecen de su UI, e incluso si forzara el evento de React, el receptor descartará mutaciones provenientes de un nodo no autorizado para esa acción.
