import { expect, type Page, test } from '@playwright/test';
import { dismissModals, setupPage } from './helpers';

type CapturedMailto = {
  to: string;
  subject: string;
  body: string;
  inviteUrl: string;
};

async function stubWindowOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Window & { __openedUrls?: string[] };
    w.__openedUrls = [];
    window.open = (url?: string | URL) => {
      const href = typeof url === 'string' ? url : (url?.toString() ?? '');
      w.__openedUrls?.push(href);
      // Prevent OS mailto / xdg-desktop-portal dialogs during E2E.
      return null;
    };
  });
}

function parseMailto(mailto: string): CapturedMailto {
  expect(mailto.startsWith('mailto:')).toBe(true);

  const withoutScheme = mailto.slice('mailto:'.length);
  const qIndex = withoutScheme.indexOf('?');
  const to = decodeURIComponent(qIndex >= 0 ? withoutScheme.slice(0, qIndex) : withoutScheme);
  const query = qIndex >= 0 ? withoutScheme.slice(qIndex + 1) : '';
  const params = new URLSearchParams(query);
  const subject = params.get('subject') ?? '';
  const body = params.get('body') ?? '';
  const inviteMatch = body.match(/https?:\/\/\S+/);
  expect(inviteMatch, `expected invite URL inside mailto body: ${body}`).toBeTruthy();

  return {
    to,
    subject,
    body,
    inviteUrl: inviteMatch?.[0] ?? '',
  };
}

async function waitForCapturedMailto(page: Page): Promise<CapturedMailto> {
  await expect
    .poll(async () => page.evaluate(() => (window as any).__openedUrls?.at(-1) ?? ''), {
      timeout: 5000,
    })
    .toMatch(/^mailto:/);

  const mailto = await page.evaluate(() => (window as any).__openedUrls.at(-1) as string);
  return parseMailto(mailto);
}

async function inviteMember(
  page: Page,
  options: { email: string; role?: 'collaborator' | 'admin' | 'vendedor' },
): Promise<CapturedMailto> {
  const modal = page.locator('[data-testid="invite-member-modal"]');
  const inviteButton = page.getByRole('button', { name: 'Invite Member' });

  await inviteButton.click();
  await expect(modal).toBeVisible();

  const roleSelect = page.locator('[data-testid="invite-role-select"]');
  if (options.role) {
    await roleSelect.selectOption(options.role);
  }

  await page.locator('[data-testid="invite-email-input"]').fill(options.email);
  await page.locator('[data-testid="invite-submit"]').click();
  await expect(modal).not.toBeVisible();

  return waitForCapturedMailto(page);
}

async function assertInviteAcceptedInNewPage(
  context: Page['context'],
  inviteUrl: string,
  email: string,
  role: string,
): Promise<void> {
  const inviteUrlObj = new URL(inviteUrl);
  expect(inviteUrlObj.searchParams.get('invite')).toBe('true');
  expect(inviteUrlObj.searchParams.get('email')).toBe(email);
  expect(inviteUrlObj.searchParams.get('role')).toBe(role);
  expect(inviteUrlObj.searchParams.get('peerId')).toBeTruthy();

  const invitee = await context.newPage();
  await invitee.addInitScript(() => {
    (window as any).__E2E_TEST__ = true;
    localStorage.setItem('hasVisited', 'true');
    localStorage.setItem('shelfWelcomeSeen', 'true');
  });

  // Preserve invite query params; append testMode for consistent E2E flags.
  const url = new URL(inviteUrl);
  url.searchParams.set('testMode', 'true');

  await invitee.goto(url.toString());
  await expect(invitee.getByText(`Conectando con el equipo de ${email}`)).toBeVisible({
    timeout: 10000,
  });

  // App clears invite params after handling them.
  await expect
    .poll(async () => {
      const current = new URL(invitee.url());
      return current.searchParams.get('invite');
    })
    .toBeNull();

  await invitee.close();
}

test.describe('Unify team invite roles with mesh P2PRole (SRC-FUN-013)', () => {
  test('Invite Modal exposes mesh roles, builds mailto invite, and accepts invite link E2E', async ({
    page,
    context,
  }) => {
    await setupPage(page);
    await stubWindowOpen(page);

    await page.locator('[data-testid="nav-item-nav.settings"]').last().click();
    await dismissModals(page);

    await page.locator('[data-testid="settings-team-card"]').waitFor({ state: 'visible' });
    const inviteButton = page.getByRole('button', { name: 'Invite Member' });
    await expect(inviteButton).toBeVisible();

    // Role dropdown defaults + options
    await inviteButton.click();
    const modal = page.locator('[data-testid="invite-member-modal"]');
    await expect(modal).toBeVisible();

    const roleSelect = page.locator('[data-testid="invite-role-select"]');
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect).toHaveValue('collaborator');

    const options = await roleSelect.locator('option').all();
    expect(options.length).toBe(3);
    const optionValues = await Promise.all(options.map((opt) => opt.getAttribute('value')));
    expect(optionValues).toContain('collaborator');
    expect(optionValues).toContain('admin');
    expect(optionValues).toContain('vendedor');
    await page.locator('[data-testid="invite-cancel"]').click();
    await expect(modal).not.toBeVisible();

    // collaborator — mailto + accept invite in second page
    const collabMailto = await inviteMember(page, { email: 'collab@example.com' });
    expect(collabMailto.to).toBe('collab@example.com');
    expect(collabMailto.subject.length).toBeGreaterThan(0);
    expect(collabMailto.body).toContain(collabMailto.inviteUrl);

    const memberObjCollab = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'collab@example.com');
    });
    expect(memberObjCollab).toBeDefined();
    expect(memberObjCollab.role).toBe('collaborator');

    await assertInviteAcceptedInNewPage(context, collabMailto.inviteUrl, 'collab@example.com', 'collaborator');

    // vendedor — mailto payload
    const vendedorMailto = await inviteMember(page, {
      email: 'vendedor@example.com',
      role: 'vendedor',
    });
    expect(vendedorMailto.to).toBe('vendedor@example.com');
    expect(new URL(vendedorMailto.inviteUrl).searchParams.get('role')).toBe('vendedor');

    const memberObjVendedor = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'vendedor@example.com');
    });
    expect(memberObjVendedor).toBeDefined();
    expect(memberObjVendedor.role).toBe('vendedor');

    // admin — mailto payload
    const adminMailto = await inviteMember(page, { email: 'admin@example.com', role: 'admin' });
    expect(adminMailto.to).toBe('admin@example.com');
    expect(new URL(adminMailto.inviteUrl).searchParams.get('role')).toBe('admin');

    const memberObjAdmin = await page.evaluate(() => {
      const state = (window as any).__shelfAppStateForTest;
      return state?.teamMembers?.find((m: any) => m.email === 'admin@example.com');
    });
    expect(memberObjAdmin).toBeDefined();
    expect(memberObjAdmin.role).toBe('admin');
  });
});
