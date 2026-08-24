import { Activity, BookOpen, Cloud, FileText, Package, ShoppingCart, Truck, Users, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const docsData = [
  {
    id: 'intro',
    title: 'Introducción',
    icon: <BookOpen className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Bienvenido al Centro de Documentación</h2>
        <p>
          Shelf Inventory es un sistema robusto, con arquitectura <strong>Offline-First y P2P (Peer-to-Peer)</strong>.
          Esto significa que la aplicación funciona principalmente en tu dispositivo local, permitiendo operar sin
          conexión a Internet y sincronizándose mágicamente cuando detecta a otros dispositivos de tu sucursal o cuando
          recupera la conexión.
        </p>
        <p>Explora los módulos en el menú lateral para comprender cómo sacar el máximo provecho de tu inventario.</p>
      </div>
    ),
  },
  {
    id: 'inventory',
    title: 'Inventario',
    icon: <Package className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Gestión de Inventario</h2>
        <p>
          El módulo de inventario te permite registrar productos con <strong>múltiples variantes</strong> (color, talla,
          material).
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Códigos de Barras:</strong> Cada producto genera o enlaza un código de barras. Puedes escanearlos
            directamente desde tu cámara.
          </li>
          <li>
            <strong>Alerta de Stock Bajo:</strong> Configura mínimos para recibir avisos cuando el producto esté por
            agotarse.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'sales',
    title: 'Ventas (POS)',
    icon: <ShoppingCart className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Punto de Venta</h2>
        <p>Registra transacciones de forma rápida y segura.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Las ventas se descuentan del inventario <strong>inmediatamente y localmente</strong>.
          </li>
          <li>Usa el escáner (botón de la cámara) para añadir productos rápidamente.</li>
          <li>
            Cuando estás conectado a una base P2P, los otros dispositivos verán el descuento de stock casi en tiempo
            real (CRDT).
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'clients_suppliers',
    title: 'Contactos',
    icon: <Users className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Clientes y Proveedores</h2>
        <p>Mantén un directorio de todas tus contrapartes.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Clientes:</strong> Asocia ventas a clientes específicos para mantener un historial.
          </li>
          <li>
            <strong>Proveedores:</strong> Vincula tus compras (Purchase Orders) a los proveedores para control de
            gastos.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'purchases',
    title: 'Compras',
    icon: <Truck className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Órdenes de Compra</h2>
        <p>Gestiona el reabastecimiento de tu almacén.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Al completar y aprobar una compra, el inventario aumentará automáticamente.</li>
          <li>Revisa el historial de precios y lotes.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'reports',
    title: 'Reportes',
    icon: <FileText className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Reportes Avanzados</h2>
        <p>Genera archivos PDF estructurados con nuestra integración de nivel empresarial (jsPDF).</p>
        <p>Filtra por rangos de fechas, exporta informes de ventas, de movimientos de stock, y cierres de caja.</p>
      </div>
    ),
  },
  {
    id: 'p2p_sync',
    title: 'Sincronización P2P',
    icon: <Activity className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Red Multibodega (P2P)</h2>
        <p>
          El corazón de Shelf Inventory. Sin necesidad de depender de Firebase o servidores costosos, los dispositivos
          en tu red (con la app abierta) forman una "malla".
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CRDT:</strong> Tu información jamás colisiona. Si dos cajas registran ventas offline del mismo
            producto al mismo tiempo, el inventario se restaura correctamente al reconectarse.
          </li>
          <li>
            <strong>Nodos:</strong> Cada pestaña del navegador es un Nodo. Hay Nodos Líderes que dirigen el tráfico.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'cloud_rbac',
    title: 'Nube & Seguridad (Pro)',
    icon: <Cloud className="w-5 h-5" />,
    content: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-yellow-500">Seguridad RBAC y Nube (Pro)</h2>
        <p>
          Para empresas grandes, la seguridad criptográfica (Post-Quantum) defiende el P2P contra dispositivos intrusos.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>RBAC:</strong> Supabase protege el acceso. Solo los Cajeros ven ventas, solo el Admin ve reportes
            completos.
          </li>
          <li>
            <strong>Cloud Sync:</strong> Sincronización secundaria en la nube para copias de seguridad inmediatas en
            planes avanzados.
          </li>
        </ul>
      </div>
    ),
  },
];

const DocumentationModal: React.FC<DocumentationModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState(docsData[0].id);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-10 animate-fade-in">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Header Modal */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-black/20">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="text-yellow-500" />
            Documentación y Guías de Uso
          </h2>
          <button
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
            title="Cerrar Documentación"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Sidebar + Content) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-black/20 border-r border-white/5 overflow-y-auto hidden md:block">
            <div className="p-4 space-y-2">
              {docsData.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveTab(doc.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                    activeTab === doc.id
                      ? 'bg-yellow-500/10 text-yellow-500 font-semibold border border-yellow-500/20'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200 border border-transparent'
                  }`}
                >
                  {doc.icon}
                  {doc.title}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Tab Selector */}
          <div
            className="md:hidden flex overflow-x-auto border-b border-white/5 p-2 bg-black/20 shrink-0"
            style={{ scrollbarWidth: 'none' }}
          >
            {docsData.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveTab(doc.id)}
                className={`flex-none px-4 py-2 rounded-full text-sm mr-2 whitespace-nowrap transition-colors ${
                  activeTab === doc.id ? 'bg-yellow-500 text-black font-bold' : 'bg-white/5 text-neutral-300'
                }`}
              >
                {doc.title}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 md:p-10 overflow-y-auto text-neutral-300 bg-background">
            {docsData.find((d) => d.id === activeTab)?.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentationModal;
