// Type declarations for experimental browser APIs
// Used by components/AIChat.tsx

interface Window {
  /** Experimental Gemini Nano AI API (Chrome built-in) */
  ai?: {
    canCreateTextSession(): Promise<'readily' | 'no' | 'after-download'>;
    createTextSession(): Promise<{
      prompt(text: string): Promise<string>;
      destroy(): void;
    }>;
  };
}
