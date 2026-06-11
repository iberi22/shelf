# 🔄 Sistema de Actualización Automática - Shelf.

## 📋 Descripción

Este documento explica cómo funciona el sistema de actualización automática implementado en Shelf. usando **Vite PWA** y **Service Workers**.

## ✨ Características

- ✅ **Detección automática de actualizaciones** cada hora
- 🔔 **Notificación visual** cuando hay una nueva versión disponible
- 🚀 **Actualización con un solo clic** para aplicar cambios
- 🌐 **Funciona offline** - La app seguirá funcionando sin conexión
- 📦 **Caché inteligente** de recursos estáticos y fuentes

## 🛠️ Cómo Funciona

### 1. Service Worker
El Service Worker se registra automáticamente cuando la aplicación se carga y realiza las siguientes funciones:

- **Cache de recursos**: Almacena archivos estáticos (JS, CSS, HTML, imágenes) para uso offline
- **Verificación de actualizaciones**: Cada hora verifica si hay una nueva versión
- **Notificación al usuario**: Cuando detecta cambios, muestra una notificación

### 2. Componente UpdateNotification
El componente `UpdateNotification.tsx` muestra una notificación flotante en la esquina inferior derecha cuando:

- Se detecta una nueva versión de la aplicación
- El usuario puede elegir actualizar inmediatamente o más tarde
- La actualización recarga la página para aplicar los cambios

### 3. Configuración PWA

En `vite.config.ts`:
```typescript
VitePWA({
  registerType: 'prompt', // Solicita al usuario antes de actualizar
  workbox: {
    // Cache de recursos estáticos
    globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
    // Cache de Google Fonts
    runtimeCaching: [...]
  }
})
```

## 🎯 Flujo de Actualización

1. **Usuario visita la app** → Service Worker se registra
2. **Cada hora** → Service Worker verifica si hay actualizaciones
3. **Nueva versión detectada** → Aparece notificación flotante
4. **Usuario hace clic en "Actualizar ahora"** → App se recarga con la nueva versión
5. **Cambios aplicados** ✅

## 🔧 Desarrollo

### Testing Local

Para probar el sistema de actualización en desarrollo:

```bash
# 1. Compilar la aplicación
npm run build

# 2. Previsualizar con service worker
npm run preview

# 3. Abrir http://localhost:4173
# 4. Hacer cambios en el código
# 5. Compilar de nuevo
# 6. Verás la notificación de actualización
```

### Verificar Service Worker

Abre las DevTools del navegador:
1. **Application** → **Service Workers**
2. Verás el estado del Service Worker
3. Puedes simular actualizaciones con "Update on reload"

## 📱 Comportamiento en Producción

Cuando despliegues a producción (Firebase, Vercel, etc.):

1. **Primera visita**: Se descarga y cachea la aplicación
2. **Visitas posteriores**: Carga desde cache (ultra rápido)
3. **Nueva versión desplegada**: Usuario recibe notificación automática
4. **Actualización**: Un clic y listo

## 🌐 Caché de Recursos

El Service Worker cachea:

- ✅ Todos los archivos de la aplicación (JS, CSS, HTML)
- ✅ Imágenes y assets
- ✅ Google Fonts (por 1 año)
- ✅ Manifesto PWA

## 🎨 Personalización

### Cambiar frecuencia de verificación

En `UpdateNotification.tsx`, línea 18:
```typescript
setInterval(() => {
  r.update();
}, 60 * 60 * 1000); // Cambiar el valor (actualmente 1 hora)
```

### Actualización automática sin notificación

En `vite.config.ts`, cambiar:
```typescript
VitePWA({
  registerType: 'autoUpdate', // En lugar de 'prompt'
})
```

### Modificar estilos de la notificación

Editar `components/UpdateNotification.tsx` - La notificación usa Tailwind CSS.

## 🚨 Importante

- **Service Workers solo funcionan en HTTPS** (excepto localhost)
- En desarrollo usa `npm run preview` para probar
- El service worker no se activa con `npm run dev`

## 📚 Recursos

- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Service Worker API](https://developer.mozilla.org/es/docs/Web/API/Service_Worker_API)

## 🐛 Troubleshooting

### La notificación no aparece

1. Verifica que estés en producción o usando `npm run preview`
2. Abre DevTools → Application → Service Workers
3. Asegúrate de que el SW esté activo

### Service Worker no se actualiza

1. DevTools → Application → Service Workers
2. Marca "Update on reload"
3. Recarga la página

### Limpiar caché

```javascript
// En la consola del navegador:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
  caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
  location.reload();
}
```

---

**¡Tu app ahora se actualiza automáticamente! 🎉**
