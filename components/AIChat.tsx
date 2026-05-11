import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import type { ChatMessage } from '../types';

const AIChat: React.FC = () => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<any>(null);

  const hasProAccess = user && (user.subscriptionTier === 'pro' || user.subscriptionTier === 'pyme');
  const isAIDisabled = !hasProAccess;

  useEffect(() => {
    if (isAIDisabled || engineRef.current) return;

    const initEngine = async () => {
      setIsInitializing(true);
      try {
        const selectedModel = 'Llama-3-8B-Instruct-q4f16_1-MLC';
        const engine = await CreateMLCEngine(selectedModel, {
          initProgressCallback: (report) => {
            setInitProgress(Math.round(report.progress * 100));
          },
        });
        engineRef.current = engine;
      } catch (err) {
        console.error('WebLLM init error:', err);
        setError('Failed to initialize local AI. Make sure your browser supports WebGPU.');
      } finally {
        setIsInitializing(false);
      }
    };

    initEngine();
  }, [isAIDisabled]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isAIDisabled || !engineRef.current) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const systemInstruction = `You are an expert inventory and sales analyst for a small business.
Your name is 'StockBot'. You will receive data about the user's products and recent sales.
Your task is to answer questions and provide insights based *only* on the provided data.
- Be concise and to the point.
- If a question cannot be answered with the given data, state that clearly.
- Format your answers in simple markdown.
- NEVER invent or assume data that is not present in the context.`;

      const dataContext = JSON.stringify(
        {
          products: state.products.slice(0, 50),
          sales: state.sales.slice(0, 50),
        },
        null,
        2,
      );

      const fullPrompt = `${systemInstruction}\n\nHere is the current business data:\n${dataContext}\n\nBased on the data above, please answer the following question: "${input}"`;

      const chatMessages = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: fullPrompt },
      ];

      const reply = await engineRef.current.chat.completions.create({
        messages: chatMessages,
      });

      const modelMessage: ChatMessage = { role: 'model', text: reply.choices[0].message.content || '' };
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
        {isInitializing && (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-16 h-16 border-4 border-[#F5F5DC] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#F5F5DC] font-medium">Initializing Local AI...</p>
            <div className="w-full max-w-xs bg-[#F5F5DC]/10 h-2 rounded-full overflow-hidden">
              <div className="bg-[#F5F5DC] h-full transition-all duration-300" style={{ width: `${initProgress}%` }} />
            </div>
            <p className="text-[#F5F5DC]/60 text-xs">{initProgress}% downloaded</p>
            <p className="text-[#F5F5DC]/40 text-[10px] text-center max-w-xs">
              First time might take a while (approx. 1GB download). All data remains on your device.
            </p>
          </div>
        )}
        {messages.length === 0 && !isInitializing && (
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
          placeholder={
            isAIDisabled
              ? t('reports.aiDisabledPlaceholder')
              : isInitializing
                ? 'Initializing...'
                : t('reports.aiPlaceholder')
          }
          className="flex-1 w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F5F5DC]"
          disabled={isLoading || isAIDisabled || isInitializing}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim() || isAIDisabled || isInitializing || !engineRef.current}
          className="bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition-all active:scale-95 disabled:bg-opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '🤔' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AIChat;
