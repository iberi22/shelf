describe('Multi-Variants Creation Flow', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('hasVisited', 'true');
        win.localStorage.setItem('shelfWelcomeSeen', 'true');
      },
    });

    // Go to inventory and open add product modal
    cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
    cy.get('[data-testid="add-product-button"]').click();
  });

  it('PATRON: Single Selection - should not enter multi-mode when selecting only 1 color and 1 measure', () => {
    // Fill basic details
    cy.get('[data-testid="product-name-input"]').type('Camiseta Básica');

    // Select 1 preset color
    cy.get('button[title="Rojo"]').click();

    // Select 1 preset measure
    cy.contains('button', '20CM').click();

    // Verify it shows as selected
    cy.contains('Seleccionados:').parent().should('contain', 'Rojo');
    cy.contains('Seleccionadas:').parent().should('contain', '20CM');

    // Verify multi-mode grid is NOT shown
    cy.contains('Combinaciones').should('not.exist');

    // Generic quantity input should still be visible for single mode
    cy.get('[data-testid="product-quantity-input"]').should('exist');
  });

  it('PATRON: Custom Inputs - should allow typing custom colors and measures', () => {
    // Type custom color and press Enter
    cy.get('input[placeholder*="Color personalizado"]').type('Verde Neón{enter}');

    // Type custom measure and click Añadir
    cy.get('input[placeholder*="Medida personalizada"]').type('35CM');
    cy.get('input[placeholder*="Medida personalizada"]').next('button').click();

    // Verify custom chips are added
    cy.contains('Seleccionados:').parent().should('contain', 'Verde Neón');
    cy.contains('Seleccionadas:').parent().should('contain', '35CM');
  });

  it('PATRON: Multi Selection - should generate combinations grid automatically', () => {
    // Select 2 preset colors
    cy.get('button[title="Rojo"]').click();
    cy.get('button[title="Azul"]').click();

    // Select 2 preset measures
    cy.contains('button', '20CM').click();
    cy.contains('button', '28CM').click();

    // Verify multi-mode triggers and shows combinations count
    cy.contains('2 color(es) x 2 medida(s) = 4 combinaciones').should('exist');

    // Verify grid headers for combinations exist
    cy.contains('Rojo / 20CM').should('exist');
    cy.contains('Rojo / 28CM').should('exist');
    cy.contains('Azul / 20CM').should('exist');
    cy.contains('Azul / 28CM').should('exist');

    // Single mode generic quantity should NOT exist anymore
    cy.get('[data-testid="product-quantity-input"]').should('not.exist');
  });

  it('PATRON: Deselection - should reduce combinations when removing a chip', () => {
    // Select 2 colors and 2 measures
    cy.get('button[title="Rojo"]').click();
    cy.get('button[title="Azul"]').click();
    cy.contains('button', '20CM').click();
    cy.contains('button', '28CM').click();

    // Verify 4 combinations
    cy.contains('2 color(es) x 2 medida(s) = 4 combinaciones').should('exist');

    // Remove "Azul" using the 'x' button inside the chip
    cy.contains('span', 'Azul').next('button').click();

    // Verify combinations reduced to 2 (1 color x 2 measures)
    cy.contains('1 color(es) x 2 medida(s) = 2 combinaciones').should('exist');
    cy.contains('Azul / 20CM').should('not.exist');
    cy.contains('Rojo / 20CM').should('exist');
  });
});
