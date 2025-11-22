describe('Purchase Orders', () => {
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
    cy.addSupplier({
      name: 'Test Supplier',
      phone: '1234567890',
      email: 'test@supplier.com',
    });
    cy.get('[data-testid="nav-item-nav.inventory"]').click();
    cy.contains('tr', 'Test Product').then(($row) => {
      const id = $row.attr('data-testid').replace('product-row-', '');
      Cypress.env('productId', id);
    });
    cy.get('[data-testid="nav-item-nav.suppliers"]').click();
    cy.contains('tr', 'Test Supplier').then(($row) => {
      const id = $row.attr('data-testid').replace('supplier-row-', '');
      Cypress.env('supplierId', id);
    });
    cy.get('[data-testid="nav-item-nav.purchases"]').click();
  });

  it('should add a new purchase order', () => {
    cy.get('[data-testid="add-purchase-order-button"]').click();
    cy.get('[data-testid="purchase-order-supplier-select"]').select(Cypress.env('supplierId'));
    cy.get('[data-testid="add-purchase-order-item-button"]').click();
    cy.get('[data-testid="purchase-order-item-product-0"]').select(Cypress.env('productId'));
    cy.get('[data-testid="save-purchase-order-button"]').click();

    cy.contains('Test Supplier').should('be.visible');
  });
});
