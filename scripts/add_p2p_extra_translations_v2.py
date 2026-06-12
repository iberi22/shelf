import json
import os

locales_dir = r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales"
locales_dir2 = r"e:\scripts-python\shelf\apps\shelf-inventory\locales"

translations = {
    "en": {
        "localNode": "Local Node"
    },
    "es": {
        "localNode": "Nodo Local"
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
            
            # Merge localNode key inside data["p2pSync"]["topBar"]
            if "p2pSync" in data and "topBar" in data["p2pSync"]:
                trans = translations.get(lang) or translations.get("en")
                data["p2pSync"]["topBar"]["localNode"] = trans["localNode"]
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    
print("Translations updated successfully.")
