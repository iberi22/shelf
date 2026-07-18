import { expect, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

test.describe('Unify team invite roles with mesh P2PRole (SRC-FUN-013)', () => {
  test('Invite Modal exposes mesh roles with collaborator as default and stores them correctly', async ({ page }) => {
    // 1. Setup page (PYME mode is enabled via helpers)
    await setupPage(page);

    // 2. Click Settings in sidebar/nav
    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    // 3. Locate the Settings Team Card and the Invite button
    await page.locator('[data-testid="settings-team-card"]').waitFor({ state: 'visible' });
    const inviteButton = page.getByRole('button', { name: 'Invite Member' });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    // 4. Verify Invite Modal is visible
    const modal = page.locator('[data-testid="invite-member-modal"]');
    await expect(modal).toBeVisible();

    // 5. Verify role dropdown has default value 'collaborator'
    const roleSelect = page.locator('[data-testid="invite-role-select"]');
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect).toHaveValue('collaborator');

    // 6. Verify role dropdown has exact expected options
    const options = await roleSelect.locator('option').all();
    expect(options.length).toBe(3);

    const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));
    expect(optionValues).toContain('collaborator');
    expect(optionValues).toContain('admin');
    expect(optionValues).toContain('vendedor');

    // 7. Check if we can select and submit 'collaborator'
    await page.locator('[data-testid="invite-email-input"]').fill('collab@example.com');
    await page.locator('[data-testid="invite-submit"]').click();

    // Wait for the modal to be closed
    await expect(modal).not.toBeVisible();

    // Verify in internal state that team member collab@example.com was added with role 'collaborator'
    const memberObjCollab = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'collab@example.com');
    });
    expect(memberObjCollab).toBeDefined();
    expect(memberObjCollab.role).toBe('collaborator');

    // 8. Re-open invite modal, test 'vendedor' selection
    await inviteButton.click();
    await expect(modal).toBeVisible();
    await roleSelect.selectOption('vendedor');
    await page.locator('[data-testid="invite-email-input"]').fill('vendedor@example.com');
    await page.locator('[data-testid="invite-submit"]').click();
    await expect(modal).not.toBeVisible();

    // Verify in internal state that team member vendedor@example.com was added with role 'vendedor'
    const memberObjVendedor = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'vendedor@example.com');
    });
    expect(memberObjVendedor).toBeDefined();
    expect(memberObjVendedor.role).toBe('vendedor');

    // 9. Re-open invite modal, test 'admin' selection
    await inviteButton.click();
    await expect(modal).toBeVisible();
    await roleSelect.selectOption('admin');
    await page.locator('[data-testid="invite-email-input"]').fill('admin@example.com');
    await page.locator('[data-testid="invite-submit"]').click();
    await expect(modal).not.toBeVisible();

    // Verify in internal state that team member admin@example.com was added with role 'admin'
    const memberObjAdmin = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'admin@example.com');
    });
    expect(memberObjAdmin).toBeDefined();
    expect(memberObjAdmin.role).toBe('admin');
  });
});
