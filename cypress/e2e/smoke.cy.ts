describe('Smoke Test', () => {
  it('should load the homepage', () => {
    cy.visit('/');
    cy.contains('Shelf.').should('be.visible');
  });
});
