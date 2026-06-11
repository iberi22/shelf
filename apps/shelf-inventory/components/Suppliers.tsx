import type React from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Supplier } from 'p2p-mesh-core';
import ContactManagementPage from './ContactManagementPage';

const Suppliers: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();

  const handleAdd = (contactData: Omit<Supplier, 'id'>) => {
    const newSupplier: Supplier = { id: new Date().toISOString(), ...contactData };
    dispatch({ type: 'ADD_SUPPLIER', payload: newSupplier });
  };

  const handleUpdate = (contactData: Supplier) => {
    dispatch({ type: 'UPDATE_SUPPLIER', payload: contactData });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_SUPPLIER', payload: id });
  };

  return (
    <ContactManagementPage
      contactType="supplier"
      contacts={state.suppliers}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      title={t('suppliers.title')}
      addContactText={t('suppliers.addSupplier')}
      editContactText={t('suppliers.editSupplier')}
      emptyMessage={t('suppliers.empty')}
      deleteConfirmMessage={t('suppliers.deleteConfirm')}
      namePlaceholder={t('suppliers.form.namePlaceholder')}
      emailPlaceholder={t('suppliers.form.emailPlaceholder')}
      canEdit={state.role === 'admin' || state.permissions?.canEditSuppliers !== false}
    />
  );
};

export default Suppliers;
