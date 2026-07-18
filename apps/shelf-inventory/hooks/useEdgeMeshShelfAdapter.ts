import { useCollection } from 'edge-mesh-react';
import { useMemo } from 'react';

/**
 * Phase B: empty namespace → bare map keys (`products`, …) shared with dbSync.
 * Legacy was `useCollection('shelf', 'products')` → `shelf_products` (dual-doc).
 */
export function useEdgeMeshShelfAdapter() {
  const isEnabled = localStorage.getItem('feature_edge_mesh') === 'true';

  const products = useCollection<any>('', 'products');
  const sales = useCollection<any>('', 'sales');
  const clients = useCollection<any>('', 'clients');
  const suppliers = useCollection<any>('', 'suppliers');
  const purchaseOrders = useCollection<any>('', 'purchaseOrders');
  const arqueoSessions = useCollection<any>('', 'arqueoSessions');
  const ocrResults = useCollection<any>('', 'ocrResults');
  const auditLogs = useCollection<any>('', 'auditLogs');

  return useMemo(
    () => ({
      isEnabled,
      collections: {
        products,
        sales,
        clients,
        suppliers,
        purchaseOrders,
        arqueoSessions,
        ocrResults,
        auditLogs,
      },
    }),
    [isEnabled, products, sales, clients, suppliers, purchaseOrders, arqueoSessions, ocrResults, auditLogs],
  );
}
