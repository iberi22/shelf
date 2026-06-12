import json
import os

locales_dir = r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales"
locales_dir2 = r"e:\scripts-python\shelf\apps\shelf-inventory\locales"

translations = {
    "en": {
        "p2pSync": {
            "topBar": {
                "connectedNodes": "Connected Devices",
                "status": "Status",
                "synced": "Synced",
                "syncing": "Syncing...",
                "disconnected": "Disconnected",
                "conflictsFound": "{{count}} product conflicts",
                "resolve": "Resolve",
                "autoMerge": "Auto-Merge",
                "copyId": "Copy ID",
                "copied": "Copied!"
            },
            "conflictResolver": {
                "title": "Resolve Product Conflicts",
                "warning": "The following products have the same SKU or name but different details. Choose which product's details to keep. Quantities will be combined.",
                "keepThis": "Keep this product's details",
                "mergeBtn": "Merge Group",
                "autoMergeAll": "Auto-Merge All",
                "noConflicts": "No product conflicts found.",
                "groupLabel": "Conflict on {{type}}: {{key}}",
                "quantityMerged": "Combined Quantity: {{qty}}",
                "price": "Price: {{val}}",
                "cost": "Cost: {{val}}",
                "updatedAt": "Updated: {{val}}"
            }
        }
    },
    "es": {
        "p2pSync": {
            "topBar": {
                "connectedNodes": "Dispositivos Conectados",
                "status": "Estado",
                "synced": "Sincronizado",
                "syncing": "Sincronizando...",
                "disconnected": "Desconectado",
                "conflictsFound": "{{count}} conflictos de productos",
                "resolve": "Resolver",
                "autoMerge": "Auto-fusionar",
                "copyId": "Copiar ID",
                "copied": "¡Copiado!"
            },
            "conflictResolver": {
                "title": "Resolver Conflictos de Productos",
                "warning": "Los siguientes productos tienen el mismo SKU o nombre pero detalles diferentes. Elige qué detalles conservar. Las cantidades se sumarán.",
                "keepThis": "Conservar detalles de este producto",
                "mergeBtn": "Fusionar Grupo",
                "autoMergeAll": "Auto-fusionar Todos",
                "noConflicts": "No se encontraron conflictos de productos.",
                "groupLabel": "Conflicto en {{type}}: {{key}}",
                "quantityMerged": "Cantidad combinada: {{qty}}",
                "price": "Precio: {{val}}",
                "cost": "Costo: {{val}}",
                "updatedAt": "Actualizado: {{val}}"
            }
        }
    }
}

for d in [locales_dir, locales_dir2]:
    if not os.path.exists(d):
        continue
    for filename in os.listdir(d):
        if filename.endswith(".json"):
            filepath = os.path.join(d, filename)
            lang = filename.split(".")[0]
            with open(filepath, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except Exception:
                    continue
            
            # Use specific translation or fallback to English, then Spanish
            trans = translations.get(lang) or translations.get("en")
            
            # Merge keys inside data["p2pSync"]
            if "p2pSync" not in data:
                data["p2pSync"] = {}
                
            data["p2pSync"]["topBar"] = trans["p2pSync"]["topBar"]
            data["p2pSync"]["conflictResolver"] = trans["p2pSync"]["conflictResolver"]
            
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
print("Extra P2P translations added successfully.")
