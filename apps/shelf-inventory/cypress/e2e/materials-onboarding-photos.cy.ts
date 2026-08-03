describe('Materials, Onboarding, and Photos Smoke Tests', () => {
  describe('Onboarding', () => {
    it('Smoke: onboarding loads on fresh state', () => {
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('hasVisited', 'true');
          win.localStorage.setItem('hasCompletedOnboarding', 'false');
        },
      });
      cy.contains('¡Bienvenido a Shelf!').should('exist');
      cy.contains('Configurar mi inventario').should('exist');
    });

    it('Smoke: preset selection works', () => {
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('hasVisited', 'true');
          win.localStorage.setItem('hasCompletedOnboarding', 'false');
        },
      });
      cy.contains('Configurar mi inventario').click();
      cy.contains('¿Qué tipo de negocio manejas?').should('exist');
      cy.contains('Materas y Plantas').click();
      cy.contains('Dimensiones de variante').should('exist');
      cy.contains('Materiales (5)').should('exist');
      cy.contains('¡Configurar! ✓').should('exist');
    });
  });

  describe('Materials in Product Form', () => {
    beforeEach(() => {
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('hasVisited', 'true');
          win.localStorage.setItem('shelfWelcomeSeen', 'true');
          win.localStorage.setItem('hasCompletedOnboarding', 'true');
        },
      });
    });

    it('Smoke: material chips render in product form', () => {
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.get('[data-testid="add-product-button"]').click();
      cy.get('[data-testid="mc-material-Plástico"]').should('exist');
      cy.get('[data-testid="mc-material-Cemento"]').should('exist');
    });

    it('Smoke: combo grid shows correct count', () => {
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.get('[data-testid="add-product-button"]').click();

      // Select 2 materials to trigger combo generation
      cy.get('[data-testid="mc-material-Plástico"]').click();
      cy.get('[data-testid="mc-material-Cerámica"]').click();

      // Verify combo count text
      cy.contains('2 combinaciones').should('exist');

      // Verify combo cards for each material
      cy.get('[data-testid="combo-card-Plástico"]').should('exist');
      cy.get('[data-testid="combo-card-Cerámica"]').should('exist');
    });

    it('Smoke: product with materials saves successfully', () => {
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.get('[data-testid="add-product-button"]').click();

      cy.get('[data-testid="product-name-input"]').type('Material Pot');
      cy.get('[data-testid="product-sku-input"]').type('POT-MAT');
      cy.get('[data-testid="product-price-input"]').type('100');
      cy.get('[data-testid="product-cost-input"]').type('50');

      // Select 2 materials
      cy.get('[data-testid="mc-material-Plástico"]').click();
      cy.get('[data-testid="mc-material-Cerámica"]').click();

      // Set quantities for the combinations
      cy.get('[data-testid="combo-card-Plástico"]').find('input[type="number"]').first().clear().type('5');
      cy.get('[data-testid="combo-card-Cerámica"]').find('input[type="number"]').first().clear().type('5');

      // Save
      cy.get('[data-testid="save-product-button"]').click();

      // Check product is added in list
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.contains('Material Pot').should('exist');
    });
  });

  describe('Photos in Product Form', () => {
    beforeEach(() => {
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('hasVisited', 'true');
          win.localStorage.setItem('shelfWelcomeSeen', 'true');
          win.localStorage.setItem('hasCompletedOnboarding', 'true');
        },
      });
    });

    it('Smoke: photo upload button visible per attribute', () => {
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.get('[data-testid="add-product-button"]').click();

      // Select 2 materials to trigger isMultiMode (needed for PhotoVariantPicker to show up)
      cy.get('[data-testid="mc-material-Plástico"]').click();
      cy.get('[data-testid="mc-material-Cerámica"]').click();

      // Photo picker header should be visible
      cy.contains('Fotos por valor').should('exist');

      // Verify upload buttons are visible
      cy.get('button[title="Subir foto para Plástico"]').should('be.visible');
      cy.get('button[title="Subir foto para Cerámica"]').should('be.visible');
    });

    it('Smoke: photo assignment saves correctly', () => {
      cy.get('[data-testid="nav-item-nav.inventory"]').last().click();
      cy.get('[data-testid="add-product-button"]').click();

      // Select 2 materials to trigger isMultiMode (needed for PhotoVariantPicker to show up)
      cy.get('[data-testid="mc-material-Plástico"]').click();
      cy.get('[data-testid="mc-material-Cerámica"]').click();

      // Select file using a small base64 transparent PNG targeting the specific file input inside the Plástico row
      const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      cy.contains('span', 'Plástico')
        .parent()
        .find('input[type="file"]')
        .selectFile(
          {
            contents: Cypress.Buffer.from(base64Png, 'base64'),
            fileName: 'test.png',
            mimeType: 'image/png',
          },
          { force: true },
        );

      // Check image alt="Plástico" is displayed
      cy.get('img[alt="Plástico"]').should('exist');

      // Check that Quitar button exists
      cy.get('button[title="Quitar foto de Plástico"]').should('exist');
    });
  });

  describe('Settings Materials', () => {
    beforeEach(() => {
      cy.visit('/', {
        onBeforeLoad(win) {
          win.localStorage.setItem('hasVisited', 'true');
          win.localStorage.setItem('shelfWelcomeSeen', 'true');
          win.localStorage.setItem('hasCompletedOnboarding', 'true');
        },
      });
    });

    it('Smoke: settings materials section visible', () => {
      cy.get('[data-testid="nav-item-nav.settings"]').last().click();
      cy.contains('Materiales sugeridos').should('exist');
      cy.get('[data-testid="add-material-option"]').should('exist');
    });

    it('Smoke: add material option works', () => {
      cy.get('[data-testid="nav-item-nav.settings"]').last().click();

      // Add material option
      cy.get('[data-testid="add-material-option"]').click();

      // Edit new input using selectall + backspace to clear and type atomically, avoiding detached elements
      cy.get('[data-testid="material-options-list"]')
        .find('input')
        .last()
        .type('{selectall}{backspace}Vidrio Templado', { force: true });

      // Save config
      cy.get('[data-testid="save-inventory-config"]').click({ force: true });

      // Confirm option is saved
      cy.contains('Vidrio Templado').should('exist');
    });
  });
});
