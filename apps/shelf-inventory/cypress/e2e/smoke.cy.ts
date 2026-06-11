describe('Smoke Test', () => {
  it('should load the homepage', () => {
    cy.visit('/');
    cy.title().should('contain', 'Shelf');
  });

  it('should show the landing page CTA button', () => {
    cy.visit('/');
    cy.contains(/Empieza Gratis|Empieza Gratis/).should('be.visible');
  });
});
