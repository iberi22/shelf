import { useCollection } from 'edge-mesh-react';
import { useMemo } from 'react';

export function useEdgeMeshShelfAdapter() {
  const isEnabled = localStorage.getItem('feature_edge_mesh') === 'true';

  const products = useCollection<any>('shelf', 'products');
  const sales = useCollection<any>('shelf', 'sales');
  const clients = useCollection<any>('shelf', 'clients');
  const suppliers = useCollection<any>('shelf', 'suppliers');
  const purchaseOrders = useCollection<any>('shelf', 'purchaseOrders');
  const arqueoSessions = useCollection<any>('shelf', 'arqueoSessions');
  const ocrResults = useCollection<any>('shelf', 'ocrResults');
  const auditLogs = useCollection<any>('shelf', 'auditLogs');

  return useMemo(() => ({
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
    }
  }), [isEnabled, products, sales, clients, suppliers, purchaseOrders, arqueoSessions, ocrResults, auditLogs]);
}
