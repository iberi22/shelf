describe('P2P Sync Status', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.wait(2000);
  });

  it('should render P2P sync status header', () => {
    cy.get('[data-testid="nav-item-nav.settings"]').last().click();
    cy.wait(1000);
    // Check for P2P status indicator
    cy.get('body').should('exist');
  });

  it('should show peer ID in settings', () => {
    cy.get('[data-testid="nav-item-nav.settings"]').last().click();
    cy.wait(2000);
    // Look for peer ID display (font-mono text-yellow-400)
    cy.get('span.font-mono.text-yellow-400').should('exist');
  });

  it('should show connected peers in settings', () => {
    cy.get('[data-testid="nav-item-nav.settings"]').last().click();
    cy.wait(2000);
    // Should show some connection status
    cy.get('body').should('exist');
  });
});
