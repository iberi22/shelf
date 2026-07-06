import { spawn } from 'node:child_process';
import http from 'node:http';

console.log('🚀 Iniciando script de pruebas E2E automatizado...');

// 1. Iniciar el servidor de desarrollo
console.log('📦 Levantando el servidor de desarrollo (Vite)...');
const devServer = spawn('pnpm', ['run', 'dev'], {
  stdio: 'pipe',
  shell: true,
  cwd: process.cwd(),
});

devServer.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('ready in')) {
    console.log('✅ Servidor Vite listo.');
  }
});

// Función para verificar si el servidor responde
const checkServerReady = async (url, maxRetries = 15, interval = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const isReady = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode === 200 || res.statusCode === 404); // Vite responde 404 a veces a / si no hay index, pero el puerto está abierto
        });
        req.on('error', () => resolve(false));
      });

      if (isReady) return true;
    } catch (_e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
};

// 2. Ejecutar pruebas una vez que el servidor esté listo
const runTests = async () => {
  console.log('⏳ Esperando a que http://localhost:5173 esté disponible...');
  const isReady = await checkServerReady('http://localhost:5173');

  if (!isReady) {
    console.error('❌ El servidor no respondió a tiempo. Cancelando pruebas.');
    devServer.kill('SIGINT');
    process.exit(1);
  }

  console.log('🧪 Servidor disponible. Ejecutando Cypress headlessly...');
  const cypressProcess = spawn(
    'pnpm',
    ['cypress', 'run', '--spec', 'cypress/e2e/multi-variants-creation.cy.ts', '--browser', 'electron'],
    {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
    },
  );

  cypressProcess.on('close', (code) => {
    console.log(`\n🛑 Cypress terminó con el código: ${code}`);
    console.log('🧹 Limpiando y apagando el servidor local...');
    devServer.kill('SIGINT');
    process.exit(code);
  });
};

runTests();
