describe('Settings', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Start for Free').click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.get('[data-testid="nav-item-nav.settings"]').click();
  });

  it('should change the currency', () => {
    cy.get('[data-testid="currency-select"]').select('EUR');
    cy.get('[data-testid="currency-select"]').should('have.value', 'EUR');
  });

  it('should change the number format', () => {
    cy.get('[data-testid="number-format-select"]').select('de-DE');
    cy.get('[data-testid="number-format-select"]').should('have.value', 'de-DE');
  });

  it('should send feedback', () => {
    cy.get('[data-testid="feedback-textarea"]').type('This is a test feedback message.');
    cy.get('[data-testid="feedback-submit-button"]').click();
    cy.get('[data-testid="feedback-textarea"]').should('have.value', '');
  });
});
