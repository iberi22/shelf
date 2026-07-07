import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (_e) {
  console.warn('Could not retrieve commit hash');
}

/// <reference types="vitest" />
// https://vitejs.dev/config/
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/tests/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    react(),
    {
      name: 'shelf-features-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const url = new URL(req.url, 'http://localhost');
          const featuresPath = resolve('../../.gitcore/features.json');

          if (url.pathname === '/api/features') {
            if (req.method === 'GET') {
              if (!existsSync(featuresPath)) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'features.json not found' }));
                return;
              }
              const data = readFileSync(featuresPath, 'utf-8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(data);
              return;
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const updatedData = JSON.parse(body);
                  if (!updatedData.features || !Array.isArray(updatedData.features)) {
                    throw new Error('Invalid features format');
                  }

                  // Recalculate metadata stats
                  const total = updatedData.features.length;
                  const implemented = updatedData.features.filter(
                    (f: any) => f.status === 'implemented' || f.status === 'validated',
                  ).length;

                  if (!updatedData.metadata) {
                    updatedData.metadata = {};
                  }
                  updatedData.metadata.total_features = total;
                  updatedData.metadata.features_implemented = implemented;
                  updatedData.metadata.implementation_percentage =
                    total > 0 ? Math.round((implemented / total) * 100) : 0;
                  updatedData.metadata.updated = new Date().toISOString().split('T')[0];

                  writeFileSync(featuresPath, JSON.stringify(updatedData, null, 2), 'utf-8');

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ success: true, metadata: updatedData.metadata }));
                } catch (err: any) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || 'Failed to update features' }));
                }
              });
              return;
            }
          }
          next();
        });
      },
    },
    {
      name: 'shelf-version-endpoint',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const url = new URL(req.url, 'http://localhost');
          if (url.pathname !== '/version.json') {
            next();
            return;
          }

          const payload = JSON.stringify(
            {
              appVersion: packageJson.version,
              commitHash,
              buildId: `${packageJson.version}@${commitHash}`,
              generatedAt: new Date().toISOString(),
            },
            null,
            2,
          );

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.end(payload);
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(
            {
              appVersion: packageJson.version,
              commitHash,
              buildId: `${packageJson.version}@${commitHash}`,
              generatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        });
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'android-chrome-192x192.png', 'android-chrome-512x512.png'],
      manifest: {
        name: 'Shelf - Gesti├│n de Inventario',
        short_name: 'Shelf',
        description: 'Gesti├│n de inventario simple y potente para tu negocio. Funciona 100% offline.',
        theme_color: '#1e1e1e',
        background_color: '#121212',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        globIgnores: ['version.json'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // Increase to 10MB for large assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mlc-ai\/web-llm@.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'web-llm-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    process.argv.includes('--report') &&
      visualizer({
        filename: 'stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
  ].filter(Boolean) as any,
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/firebase')) {
            return 'firebase-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ollama-api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama-api/, ''),
      },
    },
  },
  publicDir: 'public',
});
