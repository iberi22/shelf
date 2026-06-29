describe('PDF Generation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('hasVisited', 'true');
        win.localStorage.setItem('shelfWelcomeSeen', 'true');
      },
    });

    // Ensure there's a product to generate PDF from
    cy.addProduct({
      name: 'PDF Test Product',
      sku: 'PDF-001',
      quantity: '20',
      price: '99.99',
      cost: '49.99',
    });
  });

  it('should open PDF preview from inventory', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('PDF Test Product')
      .parent()
      .within(() => {
        cy.get('[data-testid="pdf-preview-button"]').click({ force: true });
      });

    // Verify PDF modal opens
    cy.get('[data-testid="pdf-modal"]').should('exist');
    cy.contains('Vista previa PDF').should('exist');
  });

  it('should include product details in the PDF', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('PDF Test Product')
      .parent()
      .within(() => {
        cy.get('[data-testid="pdf-preview-button"]').click({ force: true });
      });

    // Verify product name and SKU appear in PDF preview
    cy.contains('PDF Test Product').should('exist');
    cy.contains('PDF-001').should('exist');
  });

  it('should allow downloading the PDF', () => {
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.contains('PDF Test Product')
      .parent()
      .within(() => {
        cy.get('[data-testid="pdf-preview-button"]').click({ force: true });
      });

    // Click download button
    cy.get('[data-testid="pdf-download-button"]').click({ force: true });

    // Verify download was triggered
    cy.readFile('cypress/downloads/*.pdf').should('exist');
  });
});
