# 🚀 Guía Rápida de Despliegue - Shelf Inventory

## ✅ Problemas Resueltos

### 1. Errores 401 en Vercel
- ✅ **metadata.json**: Ahora se copia correctamente a `dist/` durante el build
- ✅ **adsbygoogle.js**: Removido del HTML (era un placeholder sin configurar)
- ✅ **index.css**: Problema de sintaxis corregido

### 2. Configuración de Archivos Públicos
- ✅ Vite configurado para copiar archivos desde `public/`
- ✅ metadata.json movido a la carpeta `public/`
- ✅ template.csv ya disponible en `public/`

### 3. Firebase Configurado
- ✅ Variables de entorno implementadas
- ✅ Modo local por defecto (sin Firebase configurado)
- ✅ Guía completa en `FIREBASE_SETUP.md`

### 4. MCP de Firebase
- ✅ Configuración actualizada en `.vscode/mcp.json`
- ✅ Guía de solución en `MCP_SETUP.md`
- ⚠️ Requiere `firebase-tools` instalado globalmente

## 📦 Próximos Pasos para Firebase

### Opción A: Modo Local (Sin Firebase - ACTUAL)
✅ La app funciona completamente offline
✅ Los datos se guardan en localStorage
✅ No necesitas configurar nada más

### Opción B: Habilitar Firebase (Online)

1. **Crear proyecto en Firebase Console**
   ```
   https://console.firebase.google.com/
   ```

2. **Copiar variables de entorno**
   ```powershell
   Copy-Item .env.example -Destination .env.local
   ```

3. **Editar `.env.local` con tus credenciales**
   - Sigue la guía en `FIREBASE_SETUP.md`

4. **Agregar variables a Vercel**
   - Ve a tu proyecto en Vercel
   - Settings > Environment Variables
   - Agrega todas las `VITE_FIREBASE_*`

5. **Redesplegar**
   ```powershell
   vercel --prod
   ```

## 🔧 Comandos Útiles

```powershell
# Build local
pnpm run build

# Preview del build
pnpm run preview

# Desarrollo
pnpm run dev

# Desplegar a Vercel
vercel --prod

# Ver logs de Vercel
vercel logs
```

## 📊 Verificar Despliegue

Abre tu URL de Vercel y verifica:

1. ✅ La aplicación carga sin errores 401
2. ✅ No hay errores en la consola del navegador
3. ✅ Puedes crear productos en modo local
4. ✅ Los datos persisten en localStorage

## 🐛 Solución de Problemas Comunes

### Error: "Failed to load metadata.json"
✅ **Resuelto**: El archivo ahora se copia correctamente a dist/

### Error: "Firebase not configured"
✅ **Normal**: La app funciona en modo local. Para habilitar Firebase, sigue la Opción B arriba.

### Error MCP: "typer is required"
Ver `MCP_SETUP.md` para la solución completa.

```powershell
# Instalar firebase-tools globalmente
npm install -g firebase-tools

# Login
firebase login

# Verificar
firebase --version
```

### Chunks muy grandes (warning durante build)
⚠️ **Normal**: Firebase es grande. Opciones:
- ✅ Ya implementado: Code splitting para React y Firebase
- Considera: Lazy loading de componentes grandes

## 🎯 Estado Actual del Proyecto

```
✅ Build exitoso
✅ Desplegado en Vercel
✅ Errores 401 corregidos
✅ Firebase configurado para variables de entorno
✅ Modo local funcional
✅ MCP configurado (requiere setup adicional)
```

## 🔐 Límites del Free Tier de Firebase

### Firestore (Base de Datos)
- 1 GiB almacenamiento
- 50,000 lecturas/día
- 20,000 escrituras/día
- 20,000 eliminaciones/día

### Authentication (Login)
- Usuarios ilimitados
- 10,000 verificaciones/mes (teléfono)

### Storage (Archivos)
- 5 GB almacenamiento
- 1 GB/día descargas
- 20,000 uploads/día

### Hosting (si usas Firebase Hosting en lugar de Vercel)
- 10 GB almacenamiento
- 360 MB/día transferencia

## 📞 Recursos

- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Configuración completa de Firebase
- [MCP_SETUP.md](./MCP_SETUP.md) - Solucionar problemas del MCP
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guía de despliegue en Vercel
- [.env.example](./.env.example) - Plantilla de variables de entorno

---

**¡Tu proyecto está listo para producción! 🎉**

Actualmente funciona en modo local (sin Firebase). Para habilitar autenticación y base de datos en la nube, sigue los pasos en `FIREBASE_SETUP.md`.
