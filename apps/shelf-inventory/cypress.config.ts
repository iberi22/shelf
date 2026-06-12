import { readdir } from 'node:fs/promises';
import { defineConfig } from 'cypress';
import { downloadFile } from 'cypress-downloadfile/lib/addPlugin';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    numTestsKeptInMemory: 0,
    setupNodeEvents(on, _config) {
      on('task', {
        downloadFile,
        async downloads(folder) {
          return readdir(folder);
        },
      });
    },
  },
});
