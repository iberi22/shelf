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

  /** Exposed for Playwright testing (set in AppContext.tsx) */
  __shelfAppStateForTest?: import('p2p-mesh-core').AppState;
  _p2pManagerForTest?: typeof import('p2p-mesh-core').p2pManager;
  _dbSyncForTest?: typeof import('p2p-mesh-core').dbSync;
}
