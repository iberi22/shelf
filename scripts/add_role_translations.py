import json
import os

locales_dirs = [
    r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales",
    r"e:\scripts-python\shelf\apps\shelf-inventory\locales"
]

translations = {
    "en": {
        "p2pSync": {
            "configCollaboratorTitle": "Collaborator Configuration",
            "roleAdmin": "Admin",
            "roleVendedor": "Seller",
            "roleCustom": "Custom"
        }
    },
    "es": {
        "p2pSync": {
            "configCollaboratorTitle": "Configuración del Colaborador",
            "roleAdmin": "Admin",
            "roleVendedor": "Vendedor",
            "roleCustom": "Personalizado"
        }
    },
    "pt": {
        "p2pSync": {
            "configCollaboratorTitle": "Configuração do Colaborador",
            "roleAdmin": "Admin",
            "roleVendedor": "Vendedor",
            "roleCustom": "Personalizado"
        }
    },
    "fr": {
        "p2pSync": {
            "configCollaboratorTitle": "Configuration du Collaborateur",
            "roleAdmin": "Admin",
            "roleVendedor": "Vendeur",
            "roleCustom": "Personnalisé"
        }
    },
    "de": {
        "p2pSync": {
            "configCollaboratorTitle": "Mitarbeiterkonfiguration",
            "roleAdmin": "Admin",
            "roleVendedor": "Verkäufer",
            "roleCustom": "Benutzerdefiniert"
        }
    },
    "it": {
        "p2pSync": {
            "configCollaboratorTitle": "Configurazione Collaboratore",
            "roleAdmin": "Admin",
            "roleVendedor": "Venditore",
            "roleCustom": "Personalizzato"
        }
    },
    "ja": {
        "p2pSync": {
            "configCollaboratorTitle": "コラボレーター設定",
            "roleAdmin": "管理者",
            "roleVendedor": "販売者",
            "roleCustom": "カスタム"
        }
    },
    "zh": {
        "p2pSync": {
            "configCollaboratorTitle": "协作者配置",
            "roleAdmin": "管理员",
            "roleVendedor": "销售员",
            "roleCustom": "自定义"
        }
    },
    "ru": {
        "p2pSync": {
            "configCollaboratorTitle": "Настройка сотрудника",
            "roleAdmin": "Админ",
            "roleVendedor": "Продавец",
            "roleCustom": "Свой вариант"
        }
    },
    "ar": {
        "p2pSync": {
            "configCollaboratorTitle": "إعدادات العميل/الزميل",
            "roleAdmin": "مسؤول",
            "roleVendedor": "بائع",
            "roleCustom": "مخصص"
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
                
print("Role config translations added successfully.")
