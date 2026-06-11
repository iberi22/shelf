import type React from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Client } from 'p2p-mesh-core';
import ContactManagementPage from './ContactManagementPage';

const Clients: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();

  const handleAdd = (contactData: Omit<Client, 'id'>) => {
    const newClient: Client = { id: new Date().toISOString(), ...contactData };
    dispatch({ type: 'ADD_CLIENT', payload: newClient });
  };

  const handleUpdate = (contactData: Client) => {
    dispatch({ type: 'UPDATE_CLIENT', payload: contactData });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_CLIENT', payload: id });
  };

  return (
    <ContactManagementPage
      contactType="client"
      contacts={state.clients}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      title={t('clients.title')}
      addContactText={t('clients.addClient')}
      editContactText={t('clients.editClient')}
      emptyMessage={t('clients.empty')}
      deleteConfirmMessage={t('clients.deleteConfirm')}
      namePlaceholder={t('clients.form.namePlaceholder')}
      emailPlaceholder={t('clients.form.emailPlaceholder')}
      canEdit={state.role === 'admin' || state.permissions?.canEditClients !== false}
    />
  );
};

export default Clients;
