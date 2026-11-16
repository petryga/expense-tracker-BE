'use strict';

// A gift is why something was bought, not what it is (PLANS.md, "Gift as a
// checkmark"). Expenses get an is_gift flag; reports still show gifts as their
// own Gifts slice. Existing expenses in the Gifts category get the flag and
// move to "Uncategorized", to be given their real category by hand.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('expenses', 'is_gift', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(
      "UPDATE expenses SET is_gift = true, category = 'Uncategorized' WHERE category = 'Gifts'",
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "UPDATE expenses SET category = 'Gifts' WHERE is_gift = true AND category = 'Uncategorized'",
    );
    await queryInterface.removeColumn('expenses', 'is_gift');
  },
};
