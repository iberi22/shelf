import json
import os

locales_dirs = [
    r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales",
    r"e:\scripts-python\shelf\apps\shelf-inventory\locales"
]

translations = {
    "en": {
        "p2pSync": {
            "confirmTitle": "Confirm P2P Connection",
            "confirmWarning": "You are about to establish a secure P2P connection. This will synchronize your local database with the target device.",
            "confirmStatsTitle": "Data to Synchronize",
            "confirmSize": "Estimated Size",
            "confirmProceed": "Synchronize & Connect",
            "myQrTitle": "My QR Code",
            "scanQrTitle": "Scan QR to Connect",
            "products": "Products",
            "sales": "Sales",
            "clients": "Clients",
            "suppliers": "Suppliers",
            "orders": "Purchase Orders",
            "logs": "Audit Logs"
        }
    },
    "es": {
        "p2pSync": {
            "confirmTitle": "Confirmar Conexión P2P",
            "confirmWarning": "Estás a punto de establecer una conexión P2P segura. Esto sincronizará tu base de datos local con el dispositivo destino.",
            "confirmStatsTitle": "Datos a Sincronizar",
            "confirmSize": "Peso Estimado",
            "confirmProceed": "Sincronizar y Conectar",
            "myQrTitle": "Mi Código QR",
            "scanQrTitle": "Escanear QR para Conectar",
            "products": "Productos",
            "sales": "Ventas",
            "clients": "Clientes",
            "suppliers": "Proveedores",
            "orders": "Órdenes de Compra",
            "logs": "Registros de Auditoría"
        }
    },
    "pt": {
        "p2pSync": {
            "confirmTitle": "Confirmar Conexão P2P",
            "confirmWarning": "Você está prestes a estabelecer uma conexão P2P segura. Isso sincronizará seu banco de dados local com o dispositivo de destino.",
            "confirmStatsTitle": "Dados para Sincronizar",
            "confirmSize": "Tamanho Estimado",
            "confirmProceed": "Sincronizar & Conectar",
            "myQrTitle": "Meu Código QR",
            "scanQrTitle": "Escanear QR para Conectar",
            "products": "Produtos",
            "sales": "Vendas",
            "clients": "Clientes",
            "suppliers": "Fornecedores",
            "orders": "Pedidos de Compra",
            "logs": "Registros de Auditoria"
        }
    },
    "fr": {
        "p2pSync": {
            "confirmTitle": "Confirmer la Connexion P2P",
            "confirmWarning": "Vous êtes sur le point d'établir une connexion P2P sécurisée. Cela synchronisera votre base de données locale avec l'appareil cible.",
            "confirmStatsTitle": "Données à Synchroniser",
            "confirmSize": "Taille Estimée",
            "confirmProceed": "Synchroniser & Connecter",
            "myQrTitle": "Mon Code QR",
            "scanQrTitle": "Scanner le QR pour se Connecter",
            "products": "Produits",
            "sales": "Ventes",
            "clients": "Clients",
            "suppliers": "Fournisseurs",
            "orders": "Commandes d'Achat",
            "logs": "Journaux d'Audit"
        }
    },
    "de": {
        "p2pSync": {
            "confirmTitle": "P2P-Verbindung Bestätigen",
            "confirmWarning": "Sie sind im Begriff, eine sichere P2P-Verbindung herzustellen. Dadurch wird Ihre lokale Datenbank mit dem Zielgerät synchronisiert.",
            "confirmStatsTitle": "Zu synchronisierende Daten",
            "confirmSize": "Geschätzte Größe",
            "confirmProceed": "Synchronisieren & Verbinden",
            "myQrTitle": "Mein QR-Code",
            "scanQrTitle": "QR scannen zum Verbinden",
            "products": "Produkte",
            "sales": "Verkäufe",
            "clients": "Kunden",
            "suppliers": "Lieferanten",
            "orders": "Bestellungen",
            "logs": "Audit-Protokolle"
        }
    },
    "it": {
        "p2pSync": {
            "confirmTitle": "Conferma Connessione P2P",
            "confirmWarning": "Stai per stabilire una connessione P2P sicura. Questo sincronizzerà il tuo database locale con il dispositivo di destinazione.",
            "confirmStatsTitle": "Dati da Sincronizzare",
            "confirmSize": "Dimensione Stimata",
            "confirmProceed": "Sincronizza & Connetti",
            "myQrTitle": "Il Mio Codice QR",
            "scanQrTitle": "Scansiona QR per Connetterti",
            "products": "Prodotti",
            "sales": "Vendite",
            "clients": "Clienti",
            "suppliers": "Fornitori",
            "orders": "Ordini d'Acquisto",
            "logs": "Registri di Audit"
        }
    },
    "ja": {
        "p2pSync": {
            "confirmTitle": "P2P接続の確認",
            "confirmWarning": "安全なP2P接続を確立しようとしています。これにより、ローカルデータベースがターゲットデバイスと同期されます。",
            "confirmStatsTitle": "同期するデータ",
            "confirmSize": "推定サイズ",
            "confirmProceed": "同期して接続",
            "myQrTitle": "マイQRコード",
            "scanQrTitle": "QRをスキャンして接続",
            "products": "製品",
            "sales": "売上",
            "clients": "顧客",
            "suppliers": "仕入先",
            "orders": "購入注文",
            "logs": "監査ログ"
        }
    },
    "zh": {
        "p2pSync": {
            "confirmTitle": "确认 P2P 连接",
            "confirmWarning": "您即将建立安全的 P2P 连接。这将使您的本地数据库与目标设备同步。",
            "confirmStatsTitle": "要同步的数据",
            "confirmSize": "估计大小",
            "confirmProceed": "同步并连接",
            "myQrTitle": "我的 QR 码",
            "scanQrTitle": "扫描 QR 码进行连接",
            "products": "产品",
            "sales": "销售",
            "clients": "客户",
            "suppliers": "供应商",
            "orders": "采购订单",
            "logs": "审计日志"
        }
    },
    "ru": {
        "p2pSync": {
            "confirmTitle": "Подтвердить P2P-подключение",
            "confirmWarning": "Вы собираетесь установить безопасное P2P-подключение. Это синхронизирует вашу локальную базу данных с целевым устройством.",
            "confirmStatsTitle": "Данные для синхронизации",
            "confirmSize": "Оценочный размер",
            "confirmProceed": "Синхронизировать и подключить",
            "myQrTitle": "Мой QR-код",
            "scanQrTitle": "Сканировать QR для подключения",
            "products": "Продукты",
            "sales": "Продажи",
            "clients": "Клиенты",
            "suppliers": "Поставщики",
            "orders": "Заказы на закупку",
            "logs": "Журналы аудита"
        }
    },
    "ar": {
        "p2pSync": {
            "confirmTitle": "تأكيد اتصال P2P",
            "confirmWarning": "أنت على وشك إنشاء اتصال P2P آمن. سيؤدي هذا إلى مزامنة قاعدة البيانات المحلية الخاصة بك مع الجهاز المستهدف.",
            "confirmStatsTitle": "البيانات المراد مزامنتها",
            "confirmSize": "الحجم التقديري",
            "confirmProceed": "مزامنة واتصال",
            "myQrTitle": "رمز QR الخاص بي",
            "scanQrTitle": "امسح QR للاتصال",
            "products": "المنتجات",
            "sales": "المبيعات",
            "clients": "العملاء",
            "suppliers": "الموردين",
            "orders": "أوامر الشراء",
            "logs": "سجلات التدقيق"
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
                
print("Confirmation translations added successfully.")
