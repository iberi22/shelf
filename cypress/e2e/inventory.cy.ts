describe('Inventory', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Start for Free').click();
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
    cy.get('[data-testid="export-csv-button"]').click();
    cy.task('downloads', 'cypress/downloads').then((files) => {
      const fileName = files.find((file) => file.startsWith('shelf_productos'));
      expect(fileName).to.exist;
      cy.readFile(`cypress/downloads/${fileName}`).should('exist');
    });
  });
});
