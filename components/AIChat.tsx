import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import type { ChatMessage } from '../types';

const AIChat: React.FC = () => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { user, getIdToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProAccess = user && (user.subscriptionTier === 'pro' || user.subscriptionTier === 'pyme');
  const isAIDisabled = !hasProAccess;

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isAIDisabled) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication error. Please log in again.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: input,
          inventoryData: {
            products: state.products.slice(0, 50), // Send a bit more context
            sales: state.sales.slice(0, 50),
          },
        }),
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(t('reports.aiErrorNetwork')); // Generic message for auth failure
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('reports.aiErrorNetwork'));
      }

      const data = await response.json();
      const modelMessage: ChatMessage = { role: 'model', text: data.text };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('reports.aiError');
      setError(errorMessage);
      console.error(err);
      // Revert optimistic UI update on error
      setMessages((prev) => prev.filter((msg) => msg !== userMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const getWelcomeMessage = () => {
    if (isAIDisabled) {
      return t('reports.aiDisabledWelcome');
    }
    return t('reports.aiWelcome');
  };

  return (
    <div className="flex flex-col h-[60vh] p-4">
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-[#F5F5DC]/10">
              <p className="text-sm whitespace-pre-wrap">{getWelcomeMessage()}</p>
            </div>
          </div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.role === 'user' ? 'bg-[#F5F5DC] text-[#121212]' : 'bg-[#F5F5DC]/10'}`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-[#F5F5DC]/10">
              <p className="text-sm animate-pulse">{t('reports.aiThinking')}</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm my-2 text-center">{error}</p>}

      <div className="mt-4 flex gap-2 border-t border-[#F5F5DC]/20 pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={isAIDisabled ? t('reports.aiDisabledPlaceholder') : t('reports.aiPlaceholder')}
          className="flex-1 w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
          disabled={isLoading || isAIDisabled}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim() || isAIDisabled}
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '🤔' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AIChat;
