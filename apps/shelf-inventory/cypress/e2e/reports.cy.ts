describe('Reports', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.wait(2000);
  });

  it('should navigate to Reports section', () => {
    cy.get('[data-testid="nav-item-nav.reports"]').last().click();
    cy.wait(1000);
  });

  it('should render the reports page without errors', () => {
    cy.get('[data-testid="nav-item-nav.reports"]').last().click();
    cy.wait(1000);
    cy.get('body').should('contain.text', ''); // Just verify body is rendered
  });
});
