// Type declarations for experimental browser APIs
// Used by components/AIChat.tsx

import type { AppState, dbSync, p2pManager } from 'p2p-mesh-core';

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
  __shelfAppStateForTest?: AppState;
  _p2pManagerForTest?: typeof p2pManager;
  _dbSyncForTest?: typeof dbSync;
}
