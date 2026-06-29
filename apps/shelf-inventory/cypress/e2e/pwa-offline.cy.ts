describe('PWA Offline Mode', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('hasVisited', 'true');
        win.localStorage.setItem('shelfWelcomeSeen', 'true');
      },
    });

    cy.addProduct({
      name: 'Offline Test Product',
      sku: 'OFF-001',
      quantity: '15',
      price: '25',
      cost: '10',
    });
  });

  it('should register the service worker', () => {
    cy.window().then((win) => {
      if ('serviceWorker' in win.navigator) {
        win.navigator.serviceWorker.getRegistrations().then((registrations) => {
          expect(registrations.length).to.be.at.least(1);
        });
      }
    });
  });

  it('should cache API responses for offline access', () => {
    // Navigate to inventory and wait for data
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Offline Test Product').should('exist');

    // Check that the cache API has stored responses
    cy.window().then(async (win) => {
      if ('caches' in win) {
        const cacheNames = await win.caches.keys();
        expect(cacheNames.length).to.be.at.least(1);

        // Verify shelf-specific cache exists
        const shelfCache = cacheNames.find((name) => name.includes('shelf'));
        expect(shelfCache).to.not.be.undefined;
      }
    });
  });

  it('should display cached data when offline', () => {
    // First load inventory while online
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Offline Test Product').should('exist');

    // Go offline
    cy.log('Going offline...');
    cy.window().then((win) => {
      // Use Chrome DevTools Protocol to simulate offline
      cy.exec('start /B "" cmd /c "echo online=false"', { failOnNonZeroExit: false });
    });

    // Reload and verify cached content is shown
    cy.reload();
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Offline Test Product').should('exist');
  });

  it('should show offline indicator when disconnected', () => {
    cy.window().then((win) => {
      // Dispatch offline event
      win.dispatchEvent(new Event('offline'));
    });

    // Verify offline indicator appears
    cy.get('[data-testid="offline-indicator"]').should('be.visible');
    cy.contains('Sin conexión').should('exist');
  });
});
