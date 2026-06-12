describe('Arqueo - Invoice Accounting', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('[', { timeout: 10000 }).should('exist');
    cy.contains(/Empieza Gratis|Start for Free/).click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
  });

  it('should navigate to Arqueo section', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').last().click({ force: true });
    cy.contains('Arqueo - Invoice Accounting').should('exist');
  });

  it('should show the arqueo main screen with start button', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').last().click({ force: true });
    cy.contains('Start New Session').should('exist');
  });

  it('should render navigation item', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').should('exist');
  });
});
