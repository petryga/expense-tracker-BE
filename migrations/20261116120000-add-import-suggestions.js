'use strict';

// Category suggestions from the AI service (PLANS.md, Plan 3, Phase B).
// Null means no suggestion: the feature is off, the service had none, or it
// failed. The row then imports exactly as before.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('imported_transactions', 'suggested_category', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    // 'model' for now; later also 'memory' (merchant memory) and 'example'.
    await queryInterface.addColumn('imported_transactions', 'suggestion_source', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('imported_transactions', 'suggestion_source');
    await queryInterface.removeColumn('imported_transactions', 'suggested_category');
  },
};
