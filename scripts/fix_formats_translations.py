import json
import os

locales_dirs = [
    r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales",
    r"e:\scripts-python\shelf\apps\shelf-inventory\locales"
]

for d in locales_dirs:
    if not os.path.exists(d):
        continue
    for filename in os.listdir(d):
        if filename.endswith(".json"):
            filepath = os.path.join(d, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
                    continue
            
            # Navigate to settings.currency
            settings = data.get("settings", {})
            currency = settings.get("currency", {})
            
            # Check if formatUS and formatEU exist
            format_us = currency.get("formatUS")
            format_eu = currency.get("formatEU")
            
            # If they exist, map them to formats.en-US and formats.de-DE
            if format_us or format_eu:
                if "formats" not in currency:
                    currency["formats"] = {}
                if format_us:
                    currency["formats"]["en-US"] = format_us
                if format_eu:
                    currency["formats"]["de-DE"] = format_eu
                
                # Update settings and currency in data
                settings["currency"] = currency
                data["settings"] = settings
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"Updated formats in {filename}")
            else:
                # If formats already exists (like in es.json), just keep it
                print(f"formats already exists or no formatUS/EU in {filename}")
