describe('Suppliers', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Empieza Gratis').click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.get('[data-testid="nav-item-nav.suppliers"]').last().click();
  });

  it('should add a new supplier', () => {
    cy.get('[data-testid="add-supplier-button"]').click();
    cy.get('[data-testid="contact-name-input"]').type('Test Supplier');
    cy.get('[data-testid="contact-phone-input"]').type('1234567890');
    cy.get('[data-testid="contact-email-input"]').type('test@supplier.com');
    cy.get('[data-testid="save-contact-button"]').click();

    cy.contains('Test Supplier').should('be.visible');
    cy.contains('1234567890').should('be.visible');
    cy.contains('test@supplier.com').should('be.visible');
  });
});
