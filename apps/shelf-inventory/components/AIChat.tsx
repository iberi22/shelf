import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { ChatMessage } from 'p2p-mesh-core';

const AIChat: React.FC = () => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { getIdToken } = useAuth();
  const { isPro } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<any>(null);

  const isAIDisabled = !isPro;

  // Optional: Init WebLLM in the background if possible
  useEffect(() => {
    if (isAIDisabled || engineRef.current) return;
    // We don't auto-init to save 1GB download unless needed or requested
  }, [isAIDisabled]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isAIDisabled) return;

    setError(null);
    const savedGeminiKey = localStorage.getItem('geminiApiKey')?.replace(/"/g, '');
    const savedOpenCodeGoKey = localStorage.getItem('openCodeGoKey')?.replace(/"/g, '');
    const savedOpenCodeGoModel = localStorage.getItem('openCodeGoModel')?.replace(/"/g, '') || 'gpt-4o';

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const contextData = {
      products: state.products.slice(0, 30).map((p) => ({ name: p.name, quantity: p.quantity, price: p.price })),
      sales: state.sales.slice(0, 20).map((s) => ({ date: s.date, total: s.totalPrice })),
    };
    const contextString = JSON.stringify(contextData);

    try {
      // Priority 1: Gemini Nano (window.ai) - Built-in Chrome feature
      try {
        // @ts-expect-error - window.ai is experimental
        if (window.ai && (await window.ai.canCreateTextSession()) === 'readily') {
          // @ts-expect-error
          const session = await window.ai.createTextSession();
          const prompt = `You are an AI assistant for a business inventory app called Shelf. 
          Below is the current inventory and sales data for context.
          Data: ${contextString}
          
          User Question: ${input}`;

          const result = await session.prompt(prompt);
          const modelMessage: ChatMessage = { role: 'model', text: result };
          setMessages((prev) => [...prev, modelMessage]);
          setIsLoading(false);
          session.destroy();
          return;
        }
      } catch (geminiNanoErr) {
        console.log('Gemini Nano not available:', geminiNanoErr);
      }

      // Priority 2: Direct Gemini API (if key is provided)
      if (savedGeminiKey) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${savedGeminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `You are an AI assistant for Shelf. Context:
                  Data: ${contextString}
                  User: ${input}`,
                      },
                    ],
                  },
                ],
              }),
            },
          );
          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
            setMessages((prev) => [...prev, { role: 'model', text }]);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('Gemini API call failed:', err);
        }
      }

      // Priority 3: WebLLM (100% Offline, heavy)
      // Only try if no keys and Nano failed, or if specifically chosen
      if (!savedGeminiKey && !savedOpenCodeGoKey) {
        try {
          if (!engineRef.current) {
            setIsInitializing(true);
            const engine = await CreateMLCEngine('Llama-3-8B-Instruct-q4f16_1-MLC', {
              initProgressCallback: (report) => setInitProgress(Math.round(report.progress * 100)),
            });
            engineRef.current = engine;
            setIsInitializing(false);
          }

          const reply = await engineRef.current.chat.completions.create({
            messages: [
              { role: 'system', content: 'You are an inventory analyst.' },
              { role: 'user', content: `Data: ${contextString}. User: ${input}` },
            ],
          });
          const text = reply.choices[0].message.content || '';
          setMessages((prev) => [...prev, { role: 'model', text }]);
          setIsLoading(false);
          return;
        } catch (webLlmErr) {
          console.log('WebLLM failed or not supported:', webLlmErr);
          setIsInitializing(false);
        }
      }

      // Priority 4: OpenCodeGo
      if (savedOpenCodeGoKey) {
        try {
          const response = await fetch('https://api.opencodego.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${savedOpenCodeGoKey}`,
            },
            body: JSON.stringify({
              model: savedOpenCodeGoModel,
              messages: [
                { role: 'system', content: 'You are an AI assistant for an inventory app.' },
                { role: 'user', content: `Context: ${contextString}. User: ${input}` },
              ],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || 'No response';
            setMessages((prev) => [...prev, { role: 'model', text }]);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('OpenCodeGo API call failed:', err);
        }
      }

      // Fallback: Cloud API
      const token = await getIdToken();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: input,
          inventoryData: { products: state.products.slice(0, 50), sales: state.sales.slice(0, 50) },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [...prev, { role: 'model', text: data.text }]);
      } else {
        throw new Error('All AI providers failed. Check your connection.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('reports.aiError');
      setError(errorMessage);
      setMessages((prev) => prev.filter((msg) => msg !== userMessage));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[50vh] md:h-[60vh] p-3 md:p-4">
      <p className="text-[10px] text-[#F5F5DC]/40 text-center mb-2 px-4 italic">
        {t('reports.aiPrivacyNote') ||
          'Note: A limited subset of your inventory and sales data is used to provide context.'}
      </p>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {isInitializing && (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="w-8 h-8 border-2 border-[#F5F5DC] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#F5F5DC]">Loading Local AI Model ({initProgress}%)...</p>
          </div>
        )}
        {messages.length === 0 && !isInitializing && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-[#F5F5DC]/10">
              <p className="text-sm whitespace-pre-wrap">
                {isAIDisabled ? t('reports.aiDisabledWelcome') : t('reports.aiWelcome')}
              </p>
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
        {isLoading && !isInitializing && (
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
          className="flex-1 min-w-0 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] text-sm"
          disabled={isLoading || isAIDisabled || isInitializing}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim() || isAIDisabled || isInitializing}
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-3 sm:px-4 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '🤔' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AIChat;
