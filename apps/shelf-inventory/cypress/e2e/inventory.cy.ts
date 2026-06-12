describe('Inventory', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('[', { timeout: 10000 }).should('exist');
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
    cy.contains('Test Product').should('exist');
    cy.contains('TEST-SKU').should('exist');
  });

  it('should export the inventory to a CSV file', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.get('[data-testid="export-csv-button"]').click({ force: true });
  });

  it('should support pasting an image from the clipboard', () => {
    cy.get('[data-testid="add-product-button"]').click();

    // Create a valid 1x1 pixel PNG image blob
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: 'image/png' });
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
    cy.get('[data-testid="product-form"] img')
      .should('have.attr', 'src')
      .and('match', /^data:image\/(webp|png);base64,/);
  });
});
