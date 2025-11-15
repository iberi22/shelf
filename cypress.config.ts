import { defineConfig } from 'cypress';
import { downloadFile } from 'cypress-downloadfile/lib/addPlugin';
import { readdir } from 'fs/promises';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on, config) {
      on('task', {
        downloadFile,
        async downloads(folder) {
          return readdir(folder);
        },
      });
    },
  },
});
