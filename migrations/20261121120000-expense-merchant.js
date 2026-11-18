'use strict';

// Where an expense was bought, when its description doesn't say: an item of a
// split Amazon charge is saved under its product name, so "Amazon" lives here.
// Empty for everything else. Search matches it as well as the description.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('expenses', 'merchant', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('expenses', 'merchant');
  },
};
