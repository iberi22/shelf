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
  });

  it('should add a new product to the inventory', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('Test Product').should('be.visible');
    cy.contains('TEST-SKU').should('be.visible');
  });

  it('should export the inventory to a CSV file', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.get('[data-testid="export-csv-button"]').click({ force: true });
  });

  it('should support pasting an image from the clipboard', () => {
    cy.get('[data-testid="add-product-button"]').click();

    // Create a mock image file
    const blob = new Blob(['mock-image-content'], { type: 'image/png' });
    const file = new File([blob], 'test-image.png', { type: 'image/png' });

    // Trigger the paste event on the form
    cy.window().then((win) => {
      const dataTransfer = new win.DataTransfer();
      dataTransfer.items.add(file);

      cy.get('[data-testid="product-form"]').trigger('paste', {
        clipboardData: dataTransfer,
      });
    });

    // Verify the image was updated in the DOM
    cy.get('[data-testid="product-form"] img').should('exist');
    cy.get('[data-testid="product-form"] img').should('have.attr', 'src').and('include', 'data:image/png;base64');
  });
});
