# Guía de Despliegue en Vercel

## ✅ Preparación Completada

El proyecto ha sido ajustado y está listo para su despliegue en Vercel:

1. ✅ Configuración de PostCSS convertida a módulos ES
2. ✅ Vite configurado para producción
3. ✅ Errores de TypeScript corregidos
4. ✅ Dependencias instaladas (chart.js, react-chartjs-2)
5. ✅ Archivo `vercel.json` creado
6. ✅ Build exitoso verificado

## 🚀 Pasos para Desplegar en Vercel

### Opción 1: Desde la CLI de Vercel

```bash
# Instalar Vercel CLI globalmente (si no lo tienes)
npm i -g vercel

# Desplegar
vercel

# Para producción
vercel --prod
```

### Opción 2: Desde GitHub (Recomendado)

1. **Sube tu proyecto a GitHub** (si no lo has hecho):
   ```bash
   git add .
   git commit -m "Preparado para despliegue en Vercel"
   git push origin master
   ```

2. **Conecta con Vercel**:
   - Ve a [vercel.com](https://vercel.com)
   - Click en "New Project"
   - Importa tu repositorio de GitHub
   - Vercel detectará automáticamente la configuración de Vite

3. **Configuración en Vercel**:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Variables de Entorno** (si las necesitas):
   - Agrega tus variables de entorno en la sección "Environment Variables"
   - Ejemplo: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.

### Opción 3: Drag & Drop

1. Ejecuta `npm run build` localmente
2. Ve a [vercel.com](https://vercel.com) y arrastra la carpeta `dist`

## 📋 Verificaciones Post-Despliegue

Después de desplegar, verifica:

- [ ] La aplicación carga correctamente
- [ ] Las rutas funcionan (gracias a los rewrites en `vercel.json`)
- [ ] Los assets estáticos se cargan desde `/assets/`
- [ ] Firebase está configurado (si usas la versión online)

## 🔧 Configuración de Firebase

Si vas a usar Firebase en producción, asegúrate de:

1. Crear un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Configurar las variables de entorno en Vercel:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

3. Actualizar `firebase.ts` para usar estas variables

## 🎯 Comandos Útiles

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview

# Linter
npm run lint
```

## 📊 Optimizaciones Aplicadas

- ✅ Code splitting para React y Firebase
- ✅ Cache optimizado para assets estáticos
- ✅ Rewrites configurados para SPA
- ✅ Build optimizado sin sourcemaps en producción

## 🐛 Solución de Problemas

### Error: "module is not defined"
✅ **Resuelto**: Convertido `postcss.config.js` a sintaxis ES module

### Errores de TypeScript
✅ **Resuelto**: Corregidos parámetros no usados y tipos implícitos

### Chunks muy grandes
⚠️ **Normal**: El bundle de Firebase es grande. Considera:
- Importar solo los módulos necesarios de Firebase
- Usar lazy loading para rutas

## 📞 Soporte

Para más información sobre el despliegue en Vercel:
- [Documentación de Vercel](https://vercel.com/docs)
- [Guía de Vite + Vercel](https://vercel.com/docs/frameworks/vite)
