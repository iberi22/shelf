describe('Inventory', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Start for Free').click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.get('[data-testid="nav-item-nav.inventory"]').click();
  });

  it('should add a new product to the inventory', () => {
    cy.get('[data-testid="add-product-button"]').click();
    cy.get('[data-testid="product-name-input"]').type('Test Product');
    cy.get('[data-testid="product-sku-input"]').type('TEST-SKU');
    cy.get('[data-testid="product-quantity-input"]').type('10');
    cy.get('[data-testid="product-price-input"]').type('100');
    cy.get('[data-testid="product-cost-input"]').type('50');
    cy.get('[data-testid="save-product-button"]').click();

    cy.contains('Test Product').should('be.visible');
    cy.contains('TEST-SKU').should('be.visible');
  });

  it('should export the inventory to a CSV file', () => {
    cy.get('[data-testid="export-csv-button"]').click();
    cy.task('downloads', 'cypress/downloads').then(files => {
      const fileName = files.find(file => file.startsWith('shelf_productos'));
      expect(fileName).to.exist;
      cy.readFile(`cypress/downloads/${fileName}`).should('exist');
    });
  });
});
