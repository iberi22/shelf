import json
import os

locales_dir = r"e:\scripts-python\shelf\apps\shelf-inventory\public\locales"
locales_dir2 = r"e:\scripts-python\shelf\apps\shelf-inventory\locales"

translations = {
    "en": {
        "p2pSync": {
            "infoTitle": "Secure P2P Sync Info",
            "infoDistributedDb": "Distributed Database: Data is synchronized directly between peers using Conflict-free Replicated Data Types (CRDTs) without a central server.",
            "infoPermissions": "Permissions System: Administrators control read/write access for each device securely.",
            "infoSync": "Data Synchronization: Changes sync in real-time across connected nodes maintaining eventual consistency.",
            "infoConfig": "Node Configuration: Configure your node's role and manage linked devices locally.",
            "infoRoles": "User Delegation: Admins can promote others or delegate specific permissions.",
            "infoProtection": "Data Protection: Data is encrypted at-rest on the device, and in-transit using Post-Quantum cryptography.",
            "configTitle": "P2P Configuration",
            "qrTitle": "Scan QR to Connect",
            "qrInstructions": "Scan this QR code from another device to establish a secure P2P link.",
            "close": "Close"
        }
    },
    "es": {
        "p2pSync": {
            "infoTitle": "Información de Sincronización P2P Segura",
            "infoDistributedDb": "Base de Datos Distribuida: Los datos se sincronizan directamente entre pares usando Tipos de Datos Replicados Libres de Conflictos (CRDTs) sin un servidor central.",
            "infoPermissions": "Sistema de Permisos: Los administradores controlan el acceso de lectura/escritura de cada dispositivo de forma segura.",
            "infoSync": "Sincronización de Datos: Los cambios se sincronizan en tiempo real entre los nodos conectados manteniendo una consistencia eventual.",
            "infoConfig": "Configuración de Nodos: Configura el rol de tu nodo y gestiona los dispositivos enlazados localmente.",
            "infoRoles": "Delegación de Usuarios: Los administradores pueden promover a otros o delegar permisos específicos.",
            "infoProtection": "Protección de Datos: Los datos se cifran en reposo en el dispositivo y en tránsito mediante criptografía Post-Cuántica.",
            "configTitle": "Configuración P2P",
            "qrTitle": "Escanear QR para Conectar",
            "qrInstructions": "Escanea este código QR desde otro dispositivo para establecer un enlace P2P seguro.",
            "close": "Cerrar"
        }
    },
    "pt": {
        "p2pSync": {
            "infoTitle": "Informações de Sincronização P2P Segura",
            "infoDistributedDb": "Banco de Dados Distribuído: Os dados são sincronizados diretamente entre pares sem um servidor central.",
            "infoPermissions": "Sistema de Permissões: Administradores controlam o acesso de leitura/escrita.",
            "infoSync": "Sincronização: Mudanças sincronizam em tempo real entre nós conectados.",
            "infoConfig": "Configuração do Nó: Configure o papel do seu nó e dispositivos vinculados.",
            "infoRoles": "Delegação de Usuários: Administradores podem promover outros.",
            "infoProtection": "Proteção de Dados: Dados criptografados no dispositivo e em trânsito (Pós-Quântica).",
            "configTitle": "Configuração P2P",
            "qrTitle": "Escanear QR",
            "qrInstructions": "Escaneie este QR de outro dispositivo para conectar.",
            "close": "Fechar"
        }
    },
    "fr": {
        "p2pSync": {
            "infoTitle": "Info Synchronisation P2P",
            "infoDistributedDb": "Base de données distribuée : Synchronisation directe entre pairs sans serveur central.",
            "infoPermissions": "Permissions : Les administrateurs gèrent l'accès lecture/écriture.",
            "infoSync": "Synchronisation : Les changements sont synchronisés en temps réel.",
            "infoConfig": "Configuration : Configurez le rôle de votre nœud et les appareils liés.",
            "infoRoles": "Délégation : Les administrateurs peuvent déléguer des rôles.",
            "infoProtection": "Protection : Données chiffrées au repos et en transit (Post-Quantique).",
            "configTitle": "Configuration P2P",
            "qrTitle": "Scanner le QR",
            "qrInstructions": "Scannez ce QR depuis un autre appareil pour vous connecter.",
            "close": "Fermer"
        }
    },
    "de": {
        "p2pSync": {
            "infoTitle": "P2P-Synchronisationsinfo",
            "infoDistributedDb": "Verteilte Datenbank: Direkte Synchronisation zwischen Peers ohne zentralen Server.",
            "infoPermissions": "Berechtigungen: Administratoren steuern den Lese-/Schreibzugriff.",
            "infoSync": "Synchronisation: Änderungen werden in Echtzeit synchronisiert.",
            "infoConfig": "Konfiguration: Konfigurieren Sie die Rolle Ihres Knotens.",
            "infoRoles": "Delegation: Administratoren können andere befördern.",
            "infoProtection": "Datenschutz: Daten werden verschlüsselt (Post-Quanten).",
            "configTitle": "P2P-Konfiguration",
            "qrTitle": "QR scannen",
            "qrInstructions": "Scannen Sie diese QR-Code von einem anderen Gerät.",
            "close": "Schließen"
        }
    },
    "it": {
        "p2pSync": {
            "infoTitle": "Info Sincronizzazione P2P",
            "infoDistributedDb": "Database Distribuito: Dati sincronizzati direttamente senza server centrale.",
            "infoPermissions": "Permessi: Gli amministratori controllano gli accessi.",
            "infoSync": "Sincronizzazione: I dati si sincronizzano in tempo reale.",
            "infoConfig": "Configurazione: Configura il tuo nodo.",
            "infoRoles": "Delegazione: Amministratori possono delegare ruoli.",
            "infoProtection": "Protezione: Dati crittografati sul dispositivo e in transito.",
            "configTitle": "Configurazione P2P",
            "qrTitle": "Scansiona QR",
            "qrInstructions": "Scansiona questo QR da un altro dispositivo.",
            "close": "Chiudi"
        }
    },
    "ja": {
        "p2pSync": {
            "infoTitle": "安全なP2P同期情報",
            "infoDistributedDb": "分散データベース：中央サーバーなしでピア間で直接データを同期します。",
            "infoPermissions": "権限：管理者がアクセスを制御します。",
            "infoSync": "同期：変更はリアルタイムで同期されます。",
            "infoConfig": "構成：ノードの役割を構成します。",
            "infoRoles": "委任：管理者は他のユーザーに権限を委任できます。",
            "infoProtection": "データ保護：データは暗号化されます（耐量子）。",
            "configTitle": "P2P設定",
            "qrTitle": "QRをスキャン",
            "qrInstructions": "他のデバイスからこのQRコードをスキャンして接続します。",
            "close": "閉じる"
        }
    },
    "zh": {
        "p2pSync": {
            "infoTitle": "安全的 P2P 同步信息",
            "infoDistributedDb": "分布式数据库：无需中央服务器，节点之间直接同步数据。",
            "infoPermissions": "权限系统：管理员控制设备的读写访问。",
            "infoSync": "数据同步：更改在连接的节点间实时同步。",
            "infoConfig": "节点配置：配置您节点的角色和链接的设备。",
            "infoRoles": "用户委托：管理员可以提升他人权限。",
            "infoProtection": "数据保护：设备上和传输中的数据均已加密（抗量子）。",
            "configTitle": "P2P 配置",
            "qrTitle": "扫描 QR 码",
            "qrInstructions": "从其他设备扫描此 QR 码以建立连接。",
            "close": "关闭"
        }
    },
    "ru": {
        "p2pSync": {
            "infoTitle": "Информация о безопасной P2P-синхронизации",
            "infoDistributedDb": "Распределенная база данных: данные синхронизируются напрямую без центрального сервера.",
            "infoPermissions": "Система разрешений: администраторы контролируют доступ.",
            "infoSync": "Синхронизация данных: изменения синхронизируются в реальном времени.",
            "infoConfig": "Конфигурация узла: настройте роль вашего узла.",
            "infoRoles": "Делегирование пользователей: администраторы могут делегировать права.",
            "infoProtection": "Защита данных: данные зашифрованы (постквантовая криптография).",
            "configTitle": "Конфигурация P2P",
            "qrTitle": "Сканировать QR",
            "qrInstructions": "Отсканируйте этот QR-код с другого устройства.",
            "close": "Закрыть"
        }
    },
    "ar": {
        "p2pSync": {
            "infoTitle": "معلومات المزامنة P2P الآمنة",
            "infoDistributedDb": "قاعدة البيانات الموزعة: تتم مزامنة البيانات مباشرة بين الأقران دون خادم مركزي.",
            "infoPermissions": "نظام الأذونات: يتحكم المسؤولون في الوصول.",
            "infoSync": "مزامنة البيانات: تتزامن التغييرات في الوقت الفعلي.",
            "infoConfig": "تكوين العقدة: قم بتكوين دور العقدة الخاصة بك.",
            "infoRoles": "تفويض المستخدم: يمكن للمسؤولين تفويض الحقوق.",
            "infoProtection": "حماية البيانات: البيانات مشفرة (ما بعد الكم).",
            "configTitle": "تكوين P2P",
            "qrTitle": "مسح QR للاتصال",
            "qrInstructions": "امسح رمز QR هذا من جهاز آخر للاتصال.",
            "close": "إغلاق"
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
            
            data["p2pSync"] = trans["p2pSync"]
            
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
print("Translations added successfully.")
