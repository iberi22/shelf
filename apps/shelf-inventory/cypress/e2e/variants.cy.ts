describe('Multi-Color / Multi-Measure Variants', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('hasVisited', 'true');
        win.localStorage.setItem('shelfWelcomeSeen', 'true');
      },
    });
  });

  it('should show variant toggle when editing a product', () => {
    cy.addProduct({
      name: 'Variant Test',
      sku: 'VAR-001',
      quantity: '5',
      price: '50',
      cost: '25',
    });

    // Navigate to inventory
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Variant Test').should('exist');

    // Click edit using the first product's edit button
    cy.contains('Variant Test').parents('tr').first().within(() => {
      cy.get('button[aria-label*="edit" i]').click({ force: true });
    });

    // Verify the variant toggle exists in the modal
    cy.contains('Artículo simple').should('exist');
    cy.contains('Con variantes').should('exist');
  });

  it('should allow selecting colors for a product', () => {
    cy.addProduct({
      name: 'Color Test',
      sku: 'COLOR-001',
      quantity: '10',
      price: '30',
      cost: '15',
    });

    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Color Test').parents('tr').first().within(() => {
      cy.get('button[aria-label*="edit" i]').click({ force: true });
    });

    // Toggle to variant mode
    cy.contains('Con variantes').click();

    // Verify color section exists
    cy.contains('Colores').should('exist');
  });

  it('should allow selecting measures for a product', () => {
    cy.addProduct({
      name: 'Size Test',
      sku: 'SIZE-001',
      quantity: '8',
      price: '40',
      cost: '20',
    });

    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Size Test').parents('tr').first().within(() => {
      cy.get('button[aria-label*="edit" i]').click({ force: true });
    });

    // Toggle to variant mode
    cy.contains('Con variantes').click();

    // Verify measure section exists
    cy.contains('Medidas').should('exist');
  });

  it('should save a product with variants', () => {
    cy.addProduct({
      name: 'Variant Save',
      sku: 'SAVE-VAR',
      quantity: '12',
      price: '60',
      cost: '30',
    });

    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Variant Save').parents('tr').first().within(() => {
      cy.get('button[aria-label*="edit" i]').click({ force: true });
    });

    // Enable variants
    cy.contains('Con variantes').click();

    // Save product
    cy.get('[data-testid="save-product-button"]').click({ force: true });

    // Verify product still exists in inventory
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Variant Save').should('exist');
  });
});
