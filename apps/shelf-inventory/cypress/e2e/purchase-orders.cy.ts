describe('Purchase Orders', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Empieza Gratis').click();
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
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('tr', 'Test Product').within(() => {
      cy.get('[data-testid^="edit-product-"]').then(($btn) => {
        const id = $btn.attr('data-testid').replace('edit-product-', '');
        Cypress.env('productId', id);
      });
    });
    cy.get('[data-testid="nav-item-nav.suppliers"]').last().click();
    cy.contains('tr', 'Test Supplier').within(() => {
      cy.get('[data-testid^="edit-supplier-"]').then(($btn) => {
        const id = $btn.attr('data-testid').replace('edit-supplier-', '');
        Cypress.env('supplierId', id);
      });
    });
    cy.get('[data-testid="nav-item-nav.purchases"]').last().click();
  });

  it('should add a new purchase order', () => {
    cy.get('[data-testid="add-purchase-order-button"]').click({ force: true });
    cy.get('[data-testid="purchase-order-supplier-select"]').select(Cypress.env('supplierId'), { force: true });
    cy.get('[data-testid="add-purchase-order-item-button"]').click({ force: true });
    cy.get('[data-testid="purchase-order-item-product-0"]').select(Cypress.env('productId'), { force: true });
    cy.get('[data-testid="save-purchase-order-button"]').click({ force: true });
    cy.wait(500);

    cy.contains('Test Supplier').should('exist');
  });
});
