import { expect, test } from '@playwright/test';

test.describe('Security & Unauthorized Mutations', () => {
  test('Collaborator is blocked from mutating unauthorized tables locally', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const collabContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const collabPage = await collabContext.newPage();
    adminPage.on('console', (msg) => console.log(`[ADMIN] ${msg.type()}: ${msg.text()}`));
    collabPage.on('console', (msg) => console.log(`[COLLAB] ${msg.type()}: ${msg.text()}`));
    adminPage.on('pageerror', (error) => console.log(`[ADMIN] page error: ${error.message}`));
    collabPage.on('pageerror', (error) => console.log(`[COLLAB] page error: ${error.message}`));

    await adminPage.goto('http://localhost:5173');
    await collabPage.goto('http://localhost:5173');

    const initScript = `
      localStorage.setItem('hasVisited', 'true');
      localStorage.setItem('shelfWelcomeSeen', 'true');
    `;
    await adminContext.addInitScript(initScript);
    await collabContext.addInitScript(initScript);

    await adminPage.goto('/');
    await adminPage.waitForTimeout(2000);
    await adminPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    const masterPeerIdLocator = adminPage.locator('span.font-mono.text-yellow-400').first();
    await masterPeerIdLocator.waitFor({ state: 'visible' });
    await expect(masterPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const adminId = await masterPeerIdLocator.innerText();

    await collabPage.goto('/');
    await collabPage.waitForTimeout(2000);
    await collabPage.locator('[data-testid="nav-item-nav.settings"]').last().click();
    const collabPeerIdLocator = collabPage.locator('span.font-mono.text-yellow-400').first();
    await collabPeerIdLocator.waitFor({ state: 'visible' });
    await expect(collabPeerIdLocator).not.toHaveText('Initializing...', { timeout: 15000 });
    const collabId = await collabPeerIdLocator.innerText();

    expect(adminId).toBeTruthy();
    expect(collabId).toBeTruthy();

    const manualInput = adminPage.getByPlaceholder(/ingresa el Peer ID|enter Peer ID/i);
    await expect(manualInput).toBeVisible();
    await manualInput.fill(collabId);

    await adminPage.getByRole('button', { name: /^Conectar$|^Connect$/i }).click();

    await expect(
      adminPage.locator('text=Configuración del Colaborador').or(adminPage.locator('text=Collaborator Configuration')),
    ).toBeVisible();
    await adminPage.getByRole('button', { name: /Sincronizar y Conectar|Synchronize/i }).click();

    await adminPage.waitForTimeout(2000);

    await adminPage.waitForTimeout(4000);

    // Now, simulate a malicious Collab trying to execute an unauthorized update on auditLogs directly through dbSync
    const result = await collabPage.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return 'NO_DBSYNC';

      try {
        dbSync.upsertEntity('auditLogs', {
          id: 'hack-123',
          action: 'ELEVATE_PRIVILEGES',
          timestamp: new Date().toISOString(),
        });
        return 'EXECUTED';
      } catch (err: any) {
        return err.message;
      }
    });

    expect(result).toBe('EXECUTED');

    // Wait to see if it gets propagated
    await adminPage.waitForTimeout(3000);

    // Check if the malicious log exists on Admin
    const adminLogs = await adminPage.evaluate(() => {
      const state = (window as any)._dbSyncForTest.getState((window as any)._dbSyncForTest.localPeerId);
      return state.auditLogs;
    });

    // It should be blocked by our role-based YJS Dispatch Filter
    const hackExists = adminLogs.some((log: any) => log.id === 'hack-123');
    expect(hackExists).toBe(false); // Should not propagate because the local filter dropped it!
  });
});
