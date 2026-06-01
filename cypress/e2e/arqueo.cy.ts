describe('Arqueo - Invoice Accounting', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('[', { timeout: 10000 }).should('be.visible');
    cy.contains(/Empieza Gratis|Start for Free/).click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
  });

  it('should navigate to Arqueo section', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').last().click({ force: true });
    cy.contains('Arqueo - Invoice Accounting').should('be.visible');
  });

  it('should show the arqueo main screen with start button', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').last().click({ force: true });
    cy.contains('Start New Session').should('be.visible');
  });

  it('should render navigation item', () => {
    cy.get('[data-testid="nav-item-nav.arqueo"]').should('exist');
  });
});
