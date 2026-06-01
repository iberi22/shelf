describe('Arqueo - Invoice Accounting', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
  });

  it('should show pro-only message for free users', () => {
    // Assuming not logged in or free user
    cy.get('[data-testid="nav-item-nav.arqueo"]').last().click();
    cy.contains('Pro Feature').should('be.visible');
    cy.contains('Invoice scanning and accounting is only available for Pro and Pyme users').should('be.visible');
  });

  it('should render navigation item', () => {
    // Check that Arqueo nav item exists
    // Verify sidebar nav exists (desktop sidebar)
    cy.get('nav').should('exist');
    // Note: Will only be clickable for Pro/Pyme users
    cy.get('[data-testid="nav-item-nav.arqueo"]').should('exist');
  });
});
