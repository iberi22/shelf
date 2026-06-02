import type React from 'react';
import { useMemo, useState } from 'react';
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

  const activeContacts = useMemo(() => contacts.filter((c) => c.isActive !== false), [contacts]);

  const {
    items: sortedContacts,
    requestSort,
    getSortIndicator,
  } = useSortableTable<Contact>(activeContacts, { key: 'name', direction: 'asc' });

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
      onUpdate({ ...editingContact, ...contactData } as Contact);
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5DC]">{title}</h2>
        <button
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all duration-200 active:scale-95 text-sm"
          data-testid={`add-${contactType}-button`}
        >
          {addContactText}
        </button>
      </div>

      {/* Desktop table */}
      <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
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

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3">
        {sortedContacts.length > 0 ? (
          sortedContacts.map((contact) => (
            <div
              key={contact.id}
              data-testid={`${contactType}-card-${contact.id}`}
              className="bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg p-3 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-[#F5F5DC] truncate">{contact.name}</h3>
                  <p className="text-xs text-[#F5F5DC]/60 mt-0.5">{contact.phone}</p>
                  {contact.email && <p className="text-xs text-[#F5F5DC]/50 truncate">{contact.email}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-2 pt-2 border-t border-[#F5F5DC]/10">
                <button
                  onClick={() => handleOpenModal(contact)}
                  className="flex-1 bg-transparent border border-yellow-500/50 text-yellow-400 font-bold py-2.5 px-3 rounded-lg hover:bg-yellow-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  data-testid={`edit-${contactType}-${contact.id}`}
                >
                  ✏️ {t('common.edit')}
                </button>
                <button
                  onClick={() => handleDelete(contact.id)}
                  className="flex-1 bg-transparent border border-red-500/50 text-red-400 font-bold py-2.5 px-3 rounded-lg hover:bg-red-500/10 transition-all active:scale-95 text-sm min-h-[44px]"
                  data-testid={`delete-${contactType}-${contact.id}`}
                >
                  🗑️ {t('common.delete')}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div
            className="text-center p-8 text-[#F5F5DC]/70 bg-[#1a1a1a] border border-[#F5F5DC]/20 rounded-lg"
            data-testid={`empty-${contactType}s-message`}
          >
            {emptyMessage}
          </div>
        )}
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
