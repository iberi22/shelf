import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useSortableTable } from '../hooks/useSortableTable';
import type { Client, Supplier } from '../types';
import ContactForm from './ContactForm';
import Modal from './Modal';

type Contact = Client | Supplier;

interface ContactManagementPageProps {
  contactType: 'client' | 'supplier';
  contacts: Contact[];
  onAdd: (contactData: Omit<Contact, 'id'>) => void;
  onUpdate: (contactData: Contact) => void;
  onDelete: (id: string) => void;
  title: string;
  addContactText: string;
  editContactText: string;
  emptyMessage: string;
  deleteConfirmMessage: string;
  namePlaceholder: string;
  emailPlaceholder: string;
}

const ContactManagementPage: React.FC<ContactManagementPageProps> = (props) => {
  const {
    contactType,
    contacts,
    onAdd,
    onUpdate,
    onDelete,
    title,
    addContactText,
    editContactText,
    emptyMessage,
    deleteConfirmMessage,
    namePlaceholder,
    emailPlaceholder,
  } = props;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const { t } = useI18n();
  const {
    items: sortedContacts,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Contact>(contacts, { key: 'name', direction: 'asc' });

  const handleOpenModal = (contact: Contact | null = null) => {
    setEditingContact(contact);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingContact(null);
    setIsModalOpen(false);
  };

  const handleSaveContact = (contactData: Omit<Contact, 'id'>) => {
    if (editingContact) {
      onUpdate({ ...editingContact, ...contactData });
    } else {
      onAdd(contactData);
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm(deleteConfirmMessage)) {
      onDelete(id);
    }
  };

  const SortableHeader: React.FC<{ sortKey: keyof Contact; labelKey: string }> = ({ sortKey, labelKey }) => (
    <th className="p-4">
      <button
        data-testid={`sort-by-${sortKey}`}
        onClick={() => requestSort(sortKey)}
        className="flex items-center gap-2 font-bold hover:text-yellow-300 transition-colors"
        aria-label={`${t('common.sortBy')} ${t(labelKey)}`}
      >
        {t(labelKey)}
        <span className="text-yellow-400 text-xs">{getSortIndicator(sortKey)}</span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-[#F5F5DC]">{title}</h2>
        <button
          onClick={() => handleOpenModal()}
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95"
          data-testid={`add-${contactType}-button`}
        >
          {addContactText}
        </button>
      </div>

      <div className="bg-[#F5F5DC]/5 border border-[#F5F5DC]/20 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-[#F5F5DC]/10">
              <tr>
                <SortableHeader sortKey="name" labelKey="common.name" />
                <SortableHeader sortKey="phone" labelKey="common.phone" />
                <SortableHeader sortKey="email" labelKey="common.email" />
                <th className="p-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedContacts.length > 0 ? (
                sortedContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    data-testid={`${contactType}-row-${contact.id}`}
                    className="border-t border-[#F5F5DC]/20 hover:bg-foreground/5 transition-colors duration-200"
                  >
                    <td className="p-4">{contact.name}</td>
                    <td className="p-4">{contact.phone}</td>
                    <td className="p-4">{contact.email || t('common.notAvailable')}</td>
                    <td className="p-4">
                      <button
                        onClick={() => handleOpenModal(contact)}
                        className="mr-2 text-yellow-400 transition-transform active:scale-95"
                        aria-label={t('common.editItem', { item: contact.name })}
                        data-testid={`edit-${contactType}-${contact.id}`}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id)}
                        className="text-red-400 transition-transform active:scale-95"
                        aria-label={t('common.deleteItem', { item: contact.name })}
                        data-testid={`delete-${contactType}-${contact.id}`}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center p-8 text-[#F5F5DC]/70"
                    data-testid={`empty-${contactType}s-message`}
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={editingContact ? editContactText : addContactText}
        >
          <ContactForm
            contact={editingContact}
            onSave={handleSaveContact}
            onCancel={handleCloseModal}
            namePlaceholder={namePlaceholder}
            emailPlaceholder={emailPlaceholder}
          />
        </Modal>
      )}
    </div>
  );
};

export default ContactManagementPage;
