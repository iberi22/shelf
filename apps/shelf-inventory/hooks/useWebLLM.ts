import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { GpuAgent } from 'gpu-agent';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseWebLLMOptions {
  modelId?: string;
}

export function useWebLLM(options: UseWebLLMOptions = {}) {
  const { modelId = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' } = options;
  const [engine, setEngine] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  const engineRef = useRef<any>(null);

  useEffect(() => {
    GpuAgent.isWebGpuSupported().then(setIsSupported);
  }, []);

  const initEngine = useCallback(
    async (selectedModelId?: string) => {
      const modelToLoad = selectedModelId || modelId;

      // If we already have an engine with the same model, reuse it
      if (engineRef.current && engineRef.current._modelId === modelToLoad) {
        return engineRef.current;
      }

      setIsInitializing(true);
      setError(null);
      setInitProgress(0);

      try {
        const newEngine = await CreateMLCEngine(modelToLoad, {
          initProgressCallback: (report) => {
            setInitProgress(Math.round(report.progress * 100));
          },
        });
        // Tag the engine with the modelId so we know what's loaded
        (newEngine as any)._modelId = modelToLoad;
        engineRef.current = newEngine;
        setEngine(newEngine);
        setIsInitializing(false);
        return newEngine;
      } catch (err: any) {
        const msg = err.message || 'Failed to initialize WebLLM engine';
        setError(msg);
        setIsInitializing(false);
        throw new Error(msg);
      }
    },
    [modelId],
  );

  const generateResponse = useCallback(
    async (
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
      onUpdate?: (text: string) => void,
      selectedModelId?: string,
    ) => {
      try {
        let currentEngine = engineRef.current;
        if (!currentEngine || (selectedModelId && currentEngine._modelId !== selectedModelId)) {
          currentEngine = await initEngine(selectedModelId);
        }

        const chunks = await currentEngine.chat.completions.create({
          messages,
          stream: true,
        });

        let fullText = '';
        for await (const chunk of chunks) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullText += content;
          if (onUpdate) {
            onUpdate(fullText);
          }
        }

        return fullText;
      } catch (err: any) {
        const msg = err.message || 'Failed to generate response';
        setError(msg);
        throw new Error(msg);
      }
    },
    [initEngine],
  );

  return {
    engine,
    isInitializing,
    initProgress,
    error,
    isSupported,
    initEngine,
    generateResponse,
  };
}
