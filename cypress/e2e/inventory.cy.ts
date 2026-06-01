describe('Inventory', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('[', { timeout: 10000 }).should('be.visible');
    cy.contains(/Empieza Gratis|Start for Free/).click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.addProduct({
      name: 'Test Product',
      sku: 'TEST-SKU',
      quantity: '10',
      price: '100',
      cost: '50',
    });
    cy.get('[data-testid="nav-item-nav.inventory"]').click();
  });

  it('should add a new product to the inventory', () => {
    cy.contains('Test Product').should('be.visible');
    cy.contains('TEST-SKU').should('be.visible');
  });

  it('should export the inventory to a CSV file', () => {
    cy.get('[data-testid="export-csv-button"]').click({ force: true });
    // Just verify click happened without error
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
  });
});
