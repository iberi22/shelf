describe('Clients', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.contains('Empieza Gratis').click();
    cy.get('[data-testid="welcome-modal-get-started-button"]').click();
    cy.get('[data-testid="nav-item-nav.clients"]').last().click();
  });

  it('should add and then edit a new client', () => {
    // Add a new client
    cy.get('[data-testid="add-client-button"]').click();
    cy.get('[data-testid="contact-name-input"]').type('Test Client');
    cy.get('[data-testid="contact-phone-input"]').type('1234567890');
    cy.get('[data-testid="contact-email-input"]').type('test@client.com');
    cy.get('[data-testid="save-contact-button"]').click();

    // Verify the new client is in the table
    cy.contains('Test Client').should('be.visible');
    cy.contains('1234567890').should('be.visible');
    cy.contains('test@client.com').should('be.visible');

    // Edit the client
    cy.contains('tr', 'Test Client').within(() => {
      cy.get('[data-testid^="edit-client-"]').click();
    });
    cy.get('[data-testid="contact-name-input"]').clear().type('Updated Test Client');
    cy.get('[data-testid="save-contact-button"]').click();

    // Verify the client was updated
    cy.contains('Updated Test Client').should('be.visible');
  });
});
