import { mount } from 'cypress/react';
import Modal from '../../components/ui/Modal';
import { I18nProvider } from '../../context/I18nContext';

describe('Modal Component', () => {
  it('renders correctly outside the container context and attaches to viewport', () => {
    // Intercept translation fetches so I18nProvider can resolve
    cy.intercept('GET', '/locales/*', { statusCode: 200, body: {} }).as('locales');

    mount(
      <I18nProvider>
        <div style={{ height: '3000px', transform: 'translateZ(0)', position: 'relative', marginTop: '100px' }}>
          <Modal isOpen={true} onClose={() => {}} title="Test Modal">
            <div data-testid="modal-content">This is a test</div>
          </Modal>
        </div>
      </I18nProvider>,
    );

    // The modal root should be fixed and its top should be 0, regardless of the container's 100px margin
    cy.get('.swal-modal-root').then(($el) => {
      const rect = $el[0].getBoundingClientRect();
      expect(rect.top).to.equal(0);
      expect(rect.left).to.equal(0);
      expect(rect.height).to.be.greaterThan(0);
    });

    cy.get('[data-testid="modal-content"]').should('be.visible');
  });
});
