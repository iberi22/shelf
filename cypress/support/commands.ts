// This is a commands file for Cypress.
// You can use it to import or create custom commands.
import 'cypress-downloadfile/lib/downloadFileCommand';

Cypress.Commands.add('addProduct', (product) => {
  cy.get('[data-testid="nav-item-nav.inventory"]').click();
  cy.get('body').then(($body) => {
    if ($body.find(`td:contains("${product.name}")`).length === 0) {
      cy.get('[data-testid="add-product-button"]').click();
      cy.get('[data-testid="product-name-input"]').type(product.name);
      cy.get('[data-testid="product-sku-input"]').type(product.sku);
      cy.get('[data-testid="product-quantity-input"]').type(product.quantity);
      cy.get('[data-testid="product-price-input"]').type(product.price);
      cy.get('[data-testid="product-cost-input"]').type(product.cost);
      cy.get('[data-testid="save-product-button"]').click();
    }
  });
});

Cypress.Commands.add('addSupplier', (supplier) => {
  cy.get('[data-testid="nav-item-nav.suppliers"]').click();
  cy.get('body').then(($body) => {
    if ($body.find(`td:contains("${supplier.name}")`).length === 0) {
      cy.get('[data-testid="add-supplier-button"]').click();
      cy.get('[data-testid="contact-name-input"]').type(supplier.name);
      cy.get('[data-testid="contact-phone-input"]').type(supplier.phone);
      cy.get('[data-testid="contact-email-input"]').type(supplier.email);
      cy.get('[data-testid="save-contact-button"]').click();
    }
  });
});
