import type React from 'react';
import { createContext, type Dispatch, type ReactNode, useContext } from 'react';
import usePersistedReducer from '../hooks/usePersistedReducer';
import type {
  AppState,
  Client,
  ImportProductsPayload,
  Product,
  PurchaseOrder,
  RestoreStatePayload,
  Sale,
  Supplier,
} from '../types';

const initialState: AppState = {
  products: [],
  sales: [],
  clients: [],
  suppliers: [],
  purchaseOrders: [],
};

type Action =
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'IMPORT_PRODUCTS'; payload: ImportProductsPayload }
  | { type: 'ADD_SALE'; payload: Sale }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: Client }
  | { type: 'DELETE_CLIENT'; payload: string }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'UPDATE_SUPPLIER'; payload: Supplier }
  | { type: 'DELETE_SUPPLIER'; payload: string }
  | { type: 'ADD_PURCHASE_ORDER'; payload: PurchaseOrder }
  | { type: 'UPDATE_PURCHASE_ORDER'; payload: PurchaseOrder }
  | { type: 'DELETE_PURCHASE_ORDER'; payload: string }
  | { type: 'RESTORE_STATE'; payload: RestoreStatePayload }
  | { type: 'BATCH_UPDATE_PRODUCTS'; payload: { toAdd: Product[]; toUpdate: Product[] } }
  | { type: 'RESET_DATA' };

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, action.payload] };
    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map((p) => (p.id === action.payload.id ? action.payload : p)),
      };
    case 'DELETE_PRODUCT':
      return { ...state, products: state.products.filter((p) => p.id !== action.payload) };

    case 'BATCH_UPDATE_PRODUCTS': {
      const { toAdd, toUpdate } = action.payload;
      const updatedIds = new Set(toUpdate.map((p) => p.id));
      const updatedProducts = state.products.map((p) => {
        if (updatedIds.has(p.id)) {
          return toUpdate.find((up) => up.id === p.id) || p;
        }
        return p;
      });
      return { ...state, products: [...updatedProducts, ...toAdd] };
    }

    case 'IMPORT_PRODUCTS': {
      const { products: newProductsData, strategy } = action.payload;
      const existingSkus = new Map<string, Product>();
      state.products.forEach((p) => {
        if (p.sku) existingSkus.set(p.sku, p);
      });

      const productsToAdd: Product[] = [];
      const productsToUpdate: Map<string, Product> = new Map();

      newProductsData.forEach((newProductData) => {
        const sku = newProductData.sku;
        if (sku && existingSkus.has(sku)) {
          // SKU exists
          if (strategy === 'update') {
            const existingProduct = existingSkus.get(sku);
            if (existingProduct) {
              const updatedProduct = { ...existingProduct, ...newProductData };
              productsToUpdate.set(updatedProduct.id, updatedProduct);
            }
          }
          // If strategy is 'skip', do nothing.
        } else {
          // New product or no SKU
          productsToAdd.push({
            id: `${new Date().toISOString()}_${Math.random()}`, // unique ID
            ...newProductData,
          });
        }
      });

      const updatedProductList = state.products.map((p) => {
        if (productsToUpdate.has(p.id)) {
          const updated = productsToUpdate.get(p.id);
          return updated || p;
        }
        return p;
      });

      return { ...state, products: [...updatedProductList, ...productsToAdd] };
    }

    case 'ADD_SALE': {
      const newProducts = [...state.products];
      for (const item of action.payload.items) {
        const productIndex = newProducts.findIndex((p) => p.id === item.productId);
        if (productIndex !== -1) {
          newProducts[productIndex] = {
            ...newProducts[productIndex],
            quantity: newProducts[productIndex].quantity - item.quantity,
          };
        }
      }

      const salePayload = { ...action.payload };
      if (salePayload.clientId) {
        const client = state.clients.find((c) => c.id === salePayload.clientId);
        if (client) {
          salePayload.clientName = client.name;
        }
      }

      return {
        ...state,
        products: newProducts,
        sales: [...state.sales, salePayload],
      };
    }

    case 'ADD_CLIENT':
      return { ...state, clients: [...state.clients, action.payload] };
    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map((c) => (c.id === action.payload.id ? action.payload : c)),
      };
    case 'DELETE_CLIENT':
      return { ...state, clients: state.clients.filter((c) => c.id !== action.payload) };

    case 'ADD_SUPPLIER':
      return { ...state, suppliers: [...state.suppliers, action.payload] };
    case 'UPDATE_SUPPLIER':
      return {
        ...state,
        suppliers: state.suppliers.map((s) => (s.id === action.payload.id ? action.payload : s)),
      };
    case 'DELETE_SUPPLIER':
      return { ...state, suppliers: state.suppliers.filter((s) => s.id !== action.payload) };

    case 'ADD_PURCHASE_ORDER':
      return { ...state, purchaseOrders: [...state.purchaseOrders, action.payload] };
    case 'UPDATE_PURCHASE_ORDER': {
      const oldPO = state.purchaseOrders.find((po) => po.id === action.payload.id);
      const newPO = action.payload;
      let products = state.products;

      // If status changed from pending to received, update stock
      if (oldPO?.status === 'pending' && newPO.status === 'received') {
        products = state.products.map((p) => {
          const poItem = newPO.items.find((item) => item.productId === p.id);
          if (poItem) {
            return { ...p, quantity: p.quantity + poItem.quantity };
          }
          return p;
        });
      }

      return {
        ...state,
        products,
        purchaseOrders: state.purchaseOrders.map((po) => (po.id === newPO.id ? newPO : po)),
      };
    }
    case 'DELETE_PURCHASE_ORDER':
      return { ...state, purchaseOrders: state.purchaseOrders.filter((po) => po.id !== action.payload) };

    case 'RESTORE_STATE':
      // Ensure all parts of the state are present, falling back to initial state if not.
      return {
        products: action.payload.products || [],
        sales: action.payload.sales || [],
        clients: action.payload.clients || [],
        suppliers: action.payload.suppliers || [],
        purchaseOrders: action.payload.purchaseOrders || [],
      };
    case 'RESET_DATA':
      return initialState;

    default:
      return state;
  }
};

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = usePersistedReducer(appReducer, initialState, 'shelfState');

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// Alias for convenience
export const useApp = useAppContext;
