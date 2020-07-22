class EntityTypeModal {
  newEntityName(str: string) {
    cy.get('#entity-name').type(str);
  }

  clearEntityName() {
    cy.get('#entity-name').focus().clear();
  }

  newEntityDescription(str: string) {
    cy.get('#description').type(str);
  }

  getCancelButton() {
    return cy.get('#entity-modal-cancel');
  }

  getAddButton() {
    return cy.get('#entity-modal-add', {timeout: 10000});
  }

}

const entityTypeModal = new EntityTypeModal();
export default entityTypeModal
