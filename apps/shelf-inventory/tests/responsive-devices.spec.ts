import { expect, test } from '@playwright/test';
import { setupPage } from './helpers';

test.describe('Responsive E2E Suite: Teléfonos y Tablets', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await page.goto('/');
    await page.waitForTimeout(500); // Dar tiempo a que el viewport se renderice correctamente
  });

  test('1. Dashboard sin desbordamiento horizontal (No horizontal overflow)', async ({ page }) => {
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 });

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(hasHorizontalOverflow, 'El Dashboard excede el ancho de la ventana').toBe(false);

    // Confirmar presencia de contenedores principales en pantalla
    const mainContainers = page.locator('main');
    await expect(mainContainers).toBeVisible();
  });

  test('2. Navegación adaptativa funcional en Móvil y Tablet', async ({ page, isMobile }) => {
    const viewportSize = page.viewportSize();
    const width = viewportSize?.width || 1024;

    if (width < 768) {
      // En teléfono, comprobar menú de navegación inferior o botón de hamburguesa
      const mobileNav = page.locator('nav.fixed.bottom-0, [data-testid^="mobile-nav-item-"]').first();
      await expect(mobileNav).toBeVisible({ timeout: 10000 });
    } else {
      // En tablet (o escritorio > 768px), la barra lateral o navegación general debe ser visible
      const desktopOrTabletNav = page.locator('aside, nav').first();
      await expect(desktopOrTabletNav).toBeVisible({ timeout: 10000 });
    }
  });

  test('3. Vista de Inventario responsiva y filtros accesibles', async ({ page, isMobile }) => {
    const viewportSize = page.viewportSize();
    const width = viewportSize?.width || 1024;

    if (width < 768) {
      const navInventory = page.locator('[data-testid="mobile-nav-item-nav.inventory"]');
      if (await navInventory.isVisible()) {
        await navInventory.click();
      } else {
        await page.goto('/#inventory');
      }
    } else {
      const sideInventory = page
        .locator('[data-testid="nav-item-nav.inventory"], button:has-text("Inventario"), a[href*="inventory"]')
        .first();
      if (await sideInventory.isVisible()) {
        await sideInventory.click();
      } else {
        await page.goto('/#inventory');
      }
    }

    await page.waitForTimeout(500);

    // Verificar el buscador de inventario (testid is stable even if i18n placeholders fail to load)
    const searchInput = page.getByTestId('inventory-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Confirmar que no hay desbordamiento en la tabla/lista de inventario
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(hasHorizontalOverflow, 'El inventario excede el ancho de la ventana').toBe(false);
  });

  test('4. Apertura y renderizado de Modales dentro del viewport táctil', async ({ page, isMobile }) => {
    const viewportSize = page.viewportSize();
    const width = viewportSize?.width || 1024;

    // Ir a inventario para probar modal
    if (width < 768) {
      const navInventory = page.locator('[data-testid="mobile-nav-item-nav.inventory"]');
      if (await navInventory.isVisible()) {
        await navInventory.click();
      }
    } else {
      const sideInventory = page.locator('[data-testid="nav-item-nav.inventory"]').first();
      if (await sideInventory.isVisible()) {
        await sideInventory.click();
      }
    }

    await page.waitForTimeout(500);

    // Intentar abrir el modal de Agregar Producto si está disponible en este rol
    const addBtn = page
      .locator(
        'button:has-text("+"), button:has-text("Agregar"), button:has-text("Add Product"), button[title*="Agregar"]',
      )
      .first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      const modal = page.locator('div[role="dialog"], div.fixed.inset-0').first();
      await expect(modal).toBeVisible({ timeout: 5000 });

      const box = await modal.boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.width).toBeLessThanOrEqual(width + 2);
      }
    }
  });

  test('5. Adaptación sin desbordamientos de secciones clave', async ({ page }) => {
    const sections = ['/', '/#inventory', '/#sales', '/#clients', '/#settings'];
    for (const section of sections) {
      await page.goto(section);
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(overflow, `Desbordamiento detectado en sección: ${section}`).toBe(false);
    }
  });
});
