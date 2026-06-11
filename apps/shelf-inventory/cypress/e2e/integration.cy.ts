describe('Integration: Supplier -> Product -> Sale', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('[', { timeout: 10000 }).should('be.visible');
    cy.contains(/Empieza Gratis|Start for Free/).click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
  });

  it('should create a supplier, link it to a product, and make a sale', () => {
    const supplierName = `Acme Corp ${Date.now()}`;
    const productName = `Anvil ${Date.now()}`;

    // 1. Create Supplier
    cy.get('[data-testid="nav-item-nav.suppliers"]').last().click({ force: true });
    cy.get('[data-testid="add-supplier-button"]').click({ force: true });
    cy.get('[data-testid="contact-name-input"]').type(supplierName, { force: true });
    cy.get('[data-testid="contact-phone-input"]').type('1234567890', { force: true });
    cy.get('[data-testid="save-contact-button"]').click({ force: true });
    cy.wait(500);
    cy.contains(supplierName).should('be.visible');

    // 2. Create Product linked to Supplier
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.get('[data-testid="add-product-button"]').click({ force: true });
    cy.get('[data-testid="product-name-input"]').type(productName, { force: true });
    cy.get('[data-testid="product-quantity-input"]').type('10', { force: true });
    cy.get('[data-testid="product-price-input"]').type('100', { force: true });
    cy.get('[data-testid="product-cost-input"]').type('50', { force: true });

    // Select the newly created supplier
    cy.get('[data-testid="product-supplier-input"]').select(supplierName, { force: true });
    cy.get('[data-testid="save-product-button"]').click({ force: true });
    cy.wait(500);

    cy.contains(productName).should('be.visible');

    // 3. Make a Sale with this Product
    cy.get('[data-testid="nav-item-nav.sales"]').last().click();
    cy.get('[data-testid="add-sale-button"]').click({ force: true });

    cy.get('[data-testid="add-sale-item-button"]').click({ force: true });

    // Select the product for the sale
    // The select options have text like "Product Name (Stock: 10)", so we find the option containing the name and select its value.
    cy.get('[data-testid="sale-item-product-0"]')
      .contains('option', productName)
      .then((option) => {
        cy.get('[data-testid="sale-item-product-0"]').select(option.val() as string, { force: true });
      });

    cy.get('[data-testid="save-sale-button"]').click({ force: true });
    cy.wait(500);

    // 4. Verification
    // Sale should appear in the sales list
    cy.get('table').contains(productName).should('be.visible');

    // Check inventory to ensure stock was reduced by 1
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click({ force: true });
    cy.wait(500);
    // We should scope it to the product row to be safe
    cy.contains('tr', productName).within(() => {
      cy.contains('9').should('be.visible');
    });
  });
});
