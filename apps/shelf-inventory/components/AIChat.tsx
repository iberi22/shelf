import { Info } from 'lucide-react';
import type { ChatMessage } from 'p2p-mesh-core';
import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSubscription } from '../context/SubscriptionContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { useWebLLM } from '../hooks/useWebLLM';

const AIChat: React.FC = () => {
  const { t, locale } = useI18n();
  const { state } = useAppContext();
  const { getIdToken } = useAuth();
  const { isPro } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [aiEngine, setAiEngine] = useLocalStorage<'auto' | 'local' | 'gemini' | 'nano'>('aiEngine', 'auto');
  const [localAiModel] = useLocalStorage('localAiModel', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');

  const {
    isInitializing,
    initProgress,
    isSupported: isWebGpuSupported,
    generateResponse,
  } = useWebLLM({ modelId: localAiModel });

  const isAIDisabled = !isPro;

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

    const isLocalModel = aiEngine === 'local' || aiEngine === 'nano';
    const productLimit = isLocalModel ? 50 : 300;
    const saleLimit = isLocalModel ? 20 : 100;
    const logLimit = isLocalModel ? 10 : 50;

    const contextData = {
      products: state.products.slice(0, productLimit).map((p) => ({
        name: p.name,
        sku: p.sku,
        quantity: p.quantity,
        price: p.price,
        cost: p.cost,
        colors: p.colors || (p.color ? [p.color] : []),
        sizes: p.sizes,
        dimensions: p.dimensions,
        material: p.material,
        capacity: p.capacity,
        customFields: p.customFields,
        variants: p.variants?.map((v) => ({
          label: v.label,
          sku: v.sku,
          quantity: v.quantity,
          attributes: v.attributes,
        })),
      })),
      sales: state.sales.slice(0, saleLimit).map((s) => ({
        date: s.date,
        total: s.totalPrice,
        items: s.items.map((i) => ({ name: i.productName, variant: i.variantLabel, quantity: i.quantity })),
      })),
      logs: state.auditLogs.slice(0, logLimit).map((l) => ({
        action: l.action,
        entityType: l.entityType,
        timestamp: l.timestamp,
      })),
    };
    const contextString = JSON.stringify(contextData);

    const systemPrompt = `You are an inventory analyst for Shelf app. You must respond in the language of this locale code: ${locale}, or match the user's input language. Be helpful and analyze the provided data accurately.`;

    try {
      // 1. Local AI (WebLLM) - Explicitly selected or Auto-fallback
      if (aiEngine === 'local' || (aiEngine === 'auto' && !savedGeminiKey)) {
        if (isWebGpuSupported === false) {
          throw new Error(t('reports.aiWebGpuNotSupported'));
        }

        try {
          // Prepare a temporary assistant message for streaming
          setMessages((prev) => [...prev, { role: 'model', text: '' }]);

          await generateResponse(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Data: ${contextString}. User: ${input}` },
            ],
            (updatedText) => {
              setMessages((prev) => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1] = { role: 'model', text: updatedText };
                }
                return newMessages;
              });
            },
          );

          setIsLoading(false);
          return;
        } catch (webLlmErr) {
          console.log('WebLLM failed:', webLlmErr);
          if (aiEngine === 'local') throw webLlmErr;
          // If auto, continue to other providers
        }
      }

      // 2. Gemini Nano (window.ai) - Explicitly selected or Auto-fallback
      if (aiEngine === 'nano' || aiEngine === 'auto') {
        try {
          if (window.ai && (await window.ai.canCreateTextSession()) === 'readily') {
            const session = await window.ai.createTextSession();
            const prompt = `${systemPrompt}
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
          if (aiEngine === 'nano') throw geminiNanoErr;
        }
      }

      // 3. Direct Gemini API
      if (aiEngine === 'gemini' || (aiEngine === 'auto' && savedGeminiKey)) {
        if (!savedGeminiKey) {
          throw new Error('Gemini API key is required but not configured.');
        }
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
                        text: `${systemPrompt} Context:
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
          if (aiEngine === 'gemini') throw err;
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
                { role: 'system', content: systemPrompt },
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
          systemPrompt,
          inventoryData: contextData,
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

  const engineHint =
    aiEngine === 'local'
      ? t('reports.aiEngineHintLocal') || 'Local WebLLM (WebGPU) — data stays on device'
      : aiEngine === 'nano'
        ? t('reports.aiEngineHintNano') || 'Gemini Nano (browser built-in)'
        : aiEngine === 'gemini'
          ? t('reports.aiEngineHintGemini') || 'Gemini API key (client) — optional proxy URL in settings'
          : t('reports.aiEngineHintAuto') || 'Auto: local if no Gemini key, else cloud engines';

  return (
    <div className="flex flex-col h-[50vh] md:h-[60vh] p-3 md:p-4" data-testid="ai-chat-panel">
      <div className="flex flex-col gap-1 mb-2 px-1">
        <div className="flex justify-between items-center gap-2">
          <p className="text-[10px] text-[#F5F5DC]/40 italic">
            {t('reports.aiPrivacyNote') ||
              'Note: A limited subset of your inventory and sales data is used to provide context.'}
          </p>
          <select
            value={aiEngine}
            data-testid="ai-engine-select"
            onChange={(e) => setAiEngine(e.target.value as 'auto' | 'local' | 'gemini' | 'nano')}
            className="text-[10px] bg-transparent border border-[#F5F5DC]/20 rounded px-1 py-0.5 text-[#F5F5DC]/60 focus:outline-none"
            disabled={isAIDisabled}
          >
            <option value="auto">Auto</option>
            <option value="local">Local</option>
            <option value="gemini">Gemini</option>
            <option value="nano">Nano</option>
          </select>
        </div>
        <p className="text-[10px] text-[#F5F5DC]/50" data-testid="ai-engine-hint">
          {isAIDisabled ? t('reports.aiDisabledWelcome') || 'AI requires Pro or Pyme plan' : engineHint}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {isInitializing && (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="w-8 h-8 border-2 border-[#F5F5DC] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#F5F5DC]">
              {t('reports.aiLoadingModel').replace('{{progress}}', initProgress.toString())}
            </p>
          </div>
        )}
        {messages.length === 0 && !isInitializing && (
          <div className="flex flex-col gap-3 max-w-md w-full">
            <div className="flex justify-start">
              <div className="p-3 rounded-lg bg-[#F5F5DC]/10 w-full">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm whitespace-pre-wrap font-bold">
                    {isAIDisabled ? t('reports.aiDisabledWelcome') : t('reports.aiWelcome')}
                  </p>
                  <button
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-[#F5F5DC]/60 hover:text-[#F5F5DC] transition-colors"
                    title="How it works"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
                {showHelp && (
                  <div
                    className="text-xs text-[#F5F5DC]/80 space-y-2 mt-3 border-t border-[#F5F5DC]/10 pt-2"
                    data-testid="ai-help-panel"
                  >
                    <p>
                      <strong>{t('reports.aiHelpHowTitle') || 'How it works'}:</strong>{' '}
                      {t('reports.aiHelpHowBody') ||
                        'Ask about inventory, recent sales, or analysis (e.g. low stock). I use your local data as context.'}
                    </p>
                    <p>
                      <strong>{t('reports.aiHelpLocalTitle') || 'Local / Nano'}:</strong>{' '}
                      {t('reports.aiHelpLocalBody') ||
                        'Data stays on-device. No extra API cost. Local uses WebLLM + WebGPU when available.'}
                    </p>
                    <p>
                      <strong>{t('reports.aiHelpCloudTitle') || 'Gemini / proxy'}:</strong>{' '}
                      {t('reports.aiHelpCloudBody') ||
                        'Optional API key or proxy URL in Settings. Not required for offline-first use.'}
                    </p>
                  </div>
                )}
              </div>
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
          data-testid="ai-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={isAIDisabled ? t('reports.aiDisabledPlaceholder') : t('reports.aiPlaceholder')}
          className="flex-1 min-w-0 p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC] text-sm"
          disabled={isLoading || isAIDisabled || isInitializing}
        />
        <button
          type="button"
          data-testid="ai-chat-send"
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
