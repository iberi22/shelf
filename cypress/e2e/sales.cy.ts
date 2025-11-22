describe('Sales', () => {
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
    cy.contains('tr', 'Test Product').then(($row) => {
      const id = $row.attr('data-testid').replace('product-row-', '');
      Cypress.env('productId', id);
    });
    cy.get('[data-testid="nav-item-nav.sales"]').click();
  });

  it('should add a new sale', () => {
    cy.get('[data-testid="add-sale-button"]').click();
    cy.get('[data-testid="add-sale-item-button"]').click();
    cy.get('[data-testid="sale-item-product-0"]').select(Cypress.env('productId'));
    cy.get('[data-testid="save-sale-button"]').click();

    cy.contains('Test Product').should('be.visible');
  });
});
