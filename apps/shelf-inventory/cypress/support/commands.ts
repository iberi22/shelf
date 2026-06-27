// This is a commands file for Cypress.
// You can use it to import or create custom commands.
import 'cypress-downloadfile/lib/downloadFileCommand';

Cypress.Commands.add('addProduct', (product) => {
  cy.get('[data-testid="nav-item-nav.inventory"]').last().click({ force: true });
  cy.get('[data-testid="add-product-button"]').should('exist');
  cy.wait(300);
  cy.get('body').then(($body) => {
    const exists = $body.text().includes(product.name);
    if (!exists) {
      cy.get('[data-testid="add-product-button"]').click({ force: true });
      cy.wait(300);
      cy.get('[data-testid="product-name-input"]').type(product.name, { force: true });
      cy.get('[data-testid="product-sku-input"]').type(product.sku, { force: true });
      if (product.quantity !== undefined) {
        cy.get('[data-testid="product-quantity-input"]').type(product.quantity, { force: true });
      }
      cy.get('[data-testid="product-price-input"]').type(product.price, { force: true });
      cy.get('[data-testid="product-cost-input"]').type(product.cost, { force: true });
      cy.get('[data-testid="save-product-button"]').click({ force: true });
      cy.wait(300);
      cy.contains(product.name, { timeout: 10000 }).should('exist');
    }
  });
});

Cypress.Commands.add('addSupplier', (supplier) => {
  cy.get('[data-testid="nav-item-nav.suppliers"]').last().click({ force: true });
  cy.get('[data-testid="add-supplier-button"]').should('exist');
  cy.wait(300);
  cy.get('body').then(($body) => {
    const exists = $body.text().includes(supplier.name);
    if (!exists) {
      cy.get('[data-testid="add-supplier-button"]').click({ force: true });
      cy.wait(300);
      cy.get('[data-testid="contact-name-input"]').type(supplier.name, { force: true });
      cy.get('[data-testid="contact-phone-input"]').type(supplier.phone, { force: true });
      cy.get('[data-testid="contact-email-input"]').type(supplier.email, { force: true });
      cy.get('[data-testid="save-contact-button"]').click({ force: true });
      cy.wait(300);
      cy.contains(supplier.name, { timeout: 10000 }).should('exist');
    }
  });
});
