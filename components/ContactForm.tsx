import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import type { Client, Supplier } from '../types';

interface ContactFormProps {
  contact: Client | Supplier | null;
  onSave: (contactData: Omit<Client, 'id'> | Omit<Supplier, 'id'>) => void;
  onCancel: () => void;
  namePlaceholder: string;
  emailPlaceholder: string;
}

const ContactForm: React.FC<ContactFormProps> = ({ contact, onSave, onCancel, namePlaceholder, emailPlaceholder }) => {
  const { t } = useI18n();
  const [name, setName] = useState(contact?.name || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!name.trim()) {
      newErrors.name = t('validation.nameRequired');
    }
    if (!phone.trim()) {
      newErrors.phone = t('validation.phoneRequired');
    }
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t('validation.invalidEmail');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({
        name,
        phone,
        email,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'me',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="contact-form">
      <div className="space-y-4">
        <div>
          <input
            data-testid="contact-name-input"
            type="text"
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full p-2 bg-[#121212] border rounded-md ${errors.name ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
          />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
        </div>
        <div>
          <input
            data-testid="contact-phone-input"
            type="tel"
            placeholder={t('common.phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`w-full p-2 bg-[#121212] border rounded-md ${errors.phone ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
          />
          {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
        </div>
        <div>
          <input
            data-testid="contact-email-input"
            type="email"
            placeholder={emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full p-2 bg-[#121212] border rounded-md ${errors.email ? 'border-red-400/70' : 'border-[#F5F5DC]/30'}`}
          />
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-4 mt-6">
        <button
          data-testid="cancel-contact-button"
          type="button"
          onClick={onCancel}
          className="bg-transparent border border-[#F5F5DC]/50 font-bold py-2 px-4 rounded-lg hover:bg-[#F5F5DC]/10 transition-colors active:scale-95"
        >
          {t('common.cancel')}
        </button>
        <button
          data-testid="save-contact-button"
          type="submit"
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-opacity active:scale-95"
        >
          {t('common.save')}
        </button>
      </div>
    </form>
  );
};

export default ContactForm;
