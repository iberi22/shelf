describe('Settings', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Empieza Gratis').click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.get('[data-testid="nav-item-nav.settings"]').last().click();
  });

  it('should change the currency', () => {
    cy.get('[data-testid="currency-select"]').select('EUR', { force: true });
    cy.get('[data-testid="currency-select"]').should('have.value', 'EUR');
  });

  it('should change the number format', () => {
    cy.get('[data-testid="number-format-select"]').select('de-DE', { force: true });
    cy.get('[data-testid="number-format-select"]').should('have.value', 'de-DE');
  });

  it('should send feedback', () => {
    cy.get('[data-testid="feedback-textarea"]').type('This is a test feedback message.', { force: true });
    cy.get('[data-testid="feedback-submit-button"]').click({ force: true });
    cy.get('[data-testid="feedback-textarea"]').should('have.value', '');
  });
});
