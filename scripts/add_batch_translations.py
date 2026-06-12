import json
import os

locales_dirs = [
    r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales",
    r"e:\scripts-python\shelf\apps\shelf-inventory\locales"
]

translations = {
    "en": {
        "inventory": {
            "batchProcessing": "Processing images...",
            "batchCompiling": "Compressing and preparing product batch:"
        }
    },
    "es": {
        "inventory": {
            "batchProcessing": "Procesando imágenes...",
            "batchCompiling": "Comprimiendo y preparando lote de productos:"
        }
    },
    "pt": {
        "inventory": {
            "batchProcessing": "Processando imagens...",
            "batchCompiling": "Comprimindo e preparando lote de produtos:"
        }
    },
    "fr": {
        "inventory": {
            "batchProcessing": "Traitement des images...",
            "batchCompiling": "Compression et préparation du lot de produits :"
        }
    },
    "de": {
        "inventory": {
            "batchProcessing": "Bilder werden verarbeitet...",
            "batchCompiling": "Produkt-Batch wird komprimiert und vorbereitet:"
        }
    },
    "it": {
        "inventory": {
            "batchProcessing": "Elaborazione delle immagini...",
            "batchCompiling": "Compressione e preparazione del lotto di prodotti:"
        }
    },
    "ja": {
        "inventory": {
            "batchProcessing": "画像を処理中...",
            "batchCompiling": "製品バッチの圧縮と準備中:"
        }
    },
    "zh": {
        "inventory": {
            "batchProcessing": "正在处理图片...",
            "batchCompiling": "正在压缩和准备产品批次："
        }
    },
    "ru": {
        "inventory": {
            "batchProcessing": "Обработка изображений...",
            "batchCompiling": "Сжатие и подготовка партии продуктов:"
        }
    },
    "ar": {
        "inventory": {
            "batchProcessing": "جاري معالجة الصور...",
            "batchCompiling": "جاري ضغط وإعداد دفعة المنتجات:"
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
            
            if "inventory" not in data:
                data["inventory"] = {}
                
            for k, v in trans["inventory"].items():
                data["inventory"][k] = v
                
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
print("Batch processing translations added successfully.")
