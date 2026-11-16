'use strict';

// Where a row's suggestion stands: 'pending' while the AI service is working on
// it in the background, 'done' once it has an answer (which may be no
// suggestion), 'none' when it was never asked or the attempt failed.
// Null on rows imported before suggestions existed.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('imported_transactions', 'suggestion_status', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('imported_transactions', 'suggestion_status');
  },
};
