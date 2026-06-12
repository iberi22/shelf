import json
import os

locales_dirs = [
    r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales",
    r"e:\scripts-python\shelf\apps\shelf-inventory\locales"
]

translations = {
    "en": {
        "p2pSync": {
            "statusVerified": "Handshake verified",
            "statusConnecting": "Connecting..."
        }
    },
    "es": {
        "p2pSync": {
            "statusVerified": "Enlace verificado",
            "statusConnecting": "Conectando..."
        }
    },
    "pt": {
        "p2pSync": {
            "statusVerified": "Conexão verificada",
            "statusConnecting": "Conectando..."
        }
    },
    "fr": {
        "p2pSync": {
            "statusVerified": "Liaison vérifiée",
            "statusConnecting": "Connexion en cours..."
        }
    },
    "de": {
        "p2pSync": {
            "statusVerified": "Handshake verifiziert",
            "statusConnecting": "Verbinden..."
        }
    },
    "it": {
        "p2pSync": {
            "statusVerified": "Handshake verificato",
            "statusConnecting": "Connessione in corso..."
        }
    },
    "ja": {
        "p2pSync": {
            "statusVerified": "検証済みのハンドシェイク",
            "statusConnecting": "接続中..."
        }
    },
    "zh": {
        "p2pSync": {
            "statusVerified": "握手已验证",
            "statusConnecting": "正在连接..."
        }
    },
    "ru": {
        "p2pSync": {
            "statusVerified": "Рукопожатие проверено",
            "statusConnecting": "Подключение..."
        }
    },
    "ar": {
        "p2pSync": {
            "statusVerified": "تم التحقق من الاتصال",
            "statusConnecting": "جاري الاتصال..."
        }
    }
}

for d in locales_dirs:
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
            
            trans = translations.get(lang) or translations.get("en")
            
            if "p2pSync" not in data:
                data["p2pSync"] = {}
                
            for k, v in trans["p2pSync"].items():
                data["p2pSync"][k] = v
                
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
print("Status translations added successfully.")
