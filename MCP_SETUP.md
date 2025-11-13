# MCP Firebase Setup Instructions

## El problema con el MCP de Firebase

El servidor MCP de Firebase requiere que tengas firebase-tools instalado globalmente y un proyecto de Firebase configurado.

## Solución Temporal - Deshabilitar MCP

Si no necesitas el MCP de Firebase ahora mismo, puedes:

1. Eliminar o comentar la configuración en `.vscode/mcp.json`
2. O instalar y configurar Firebase Tools correctamente

## Configurar Firebase Tools para MCP

### Paso 1: Instalar Firebase Tools globalmente

```powershell
npm install -g firebase-tools
```

### Paso 2: Login a Firebase

```powershell
firebase login
```

### Paso 3: Inicializar Firebase en el proyecto

```powershell
firebase init
```

Selecciona:
- ✅ Firestore
- ✅ Functions (si usas Cloud Functions)
- ✅ Hosting

### Paso 4: Actualizar mcp.json

Reemplaza `YOUR_PROJECT_ID` en `.vscode/mcp.json` con tu ID de proyecto Firebase.

```json
{
  "servers": {
    "firebase": {
      "command": "firebase",
      "args": ["--project", "tu-proyecto-id", "mcp"]
    }
  }
}
```

## Alternativa: Trabajar sin MCP

El MCP es opcional. Tu aplicación funcionará perfectamente sin él usando el SDK de Firebase directamente en `firebase.ts`.

## Verificar instalación

```powershell
# Verificar que firebase-tools está instalado
firebase --version

# Verificar proyecto actual
firebase projects:list
```

## Error "typer is required"

Este error ocurre cuando firebase-tools no está instalado o la versión es antigua.

**Solución:**

```powershell
# Actualizar firebase-tools
npm install -g firebase-tools@latest

# Verificar versión (debe ser 13.0.0 o superior)
firebase --version
```
