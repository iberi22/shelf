import { expect, test } from '@playwright/test';

test.describe('Garbage Collection & Data Purge', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local environment to initialize the store
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Admin node purges logs older than maxAgeMs and preserves newer logs', async ({ page }) => {
    // 1. Give time to initialize Context and P2P
    await page.waitForTimeout(2000);

    // 2. Set up initial data in Admin
    const initialStatus = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      if (!dbSync) return 'NO_DBSYNC';

      try {
        const nowMs = Date.now();
        const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
        const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Old logs
        dbSync.upsertEntity('auditLogs', {
          id: 'log-old-1',
          action: 'ADD_PRODUCT',
          timestamp: new Date(nowMs - thirtyOneDaysMs).toISOString(),
        });
        dbSync.upsertEntity('auditLogs', {
          id: 'log-old-2',
          action: 'UPDATE_PRODUCT',
          timestamp: new Date(nowMs - thirtyFiveDaysMs).toISOString(),
        });

        // New log
        dbSync.upsertEntity('auditLogs', {
          id: 'log-new-1',
          action: 'DELETE_PRODUCT',
          timestamp: new Date(nowMs - oneDayMs).toISOString(),
        });

        return 'INSERTED';
      } catch (err: any) {
        return err.message;
      }
    });

    expect(initialStatus).toBe('INSERTED');

    // 3. Verify logs are inserted
    const logsBefore = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      return dbSync.getState().auditLogs;
    });

    expect(logsBefore.length).toBeGreaterThanOrEqual(3);
    const hasOld1 = logsBefore.some((l: any) => l.id === 'log-old-1');
    const hasOld2 = logsBefore.some((l: any) => l.id === 'log-old-2');
    const hasNew1 = logsBefore.some((l: any) => l.id === 'log-new-1');

    expect(hasOld1).toBe(true);
    expect(hasOld2).toBe(true);
    expect(hasNew1).toBe(true);

    // 4. Start Garbage Collection with 30 days max age, and 1 second check interval
    await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const ONE_SEC_MS = 1000;

      // Stop the regular one from AppContext first to avoid conflicts
      dbSync.stopGarbageCollection('auditLogs');

      // Force admin role for test
      dbSync.localPeerId = 'admin-123';
      dbSync.setMasterPeerId('admin-123');

      // Start test one
      dbSync.startGarbageCollection('auditLogs', THIRTY_DAYS_MS, ONE_SEC_MS);
    });

    // 5. Wait for the GC to trigger at least once
    await page.waitForTimeout(2500);

    // 6. Stop GC and verify logs
    const logsAfter = await page.evaluate(() => {
      const dbSync = (window as any)._dbSyncForTest;
      dbSync.stopGarbageCollection('auditLogs');
      return dbSync.getState().auditLogs;
    });

    const stillHasOld1 = logsAfter.some((l: any) => l.id === 'log-old-1');
    const stillHasOld2 = logsAfter.some((l: any) => l.id === 'log-old-2');
    const stillHasNew1 = logsAfter.some((l: any) => l.id === 'log-new-1');

    expect(stillHasOld1).toBe(false); // Should be purged!
    expect(stillHasOld2).toBe(false); // Should be purged!
    expect(stillHasNew1).toBe(true); // Should remain!
  });
});
