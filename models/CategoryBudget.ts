import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CategoryBudget extends Model {
  declare id: string;
  declare categoryId: string;
  declare userId: string | null;
  declare budget: number;
}

CategoryBudget.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    budget: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'category_budgets',
    underscored: true,
    sequelize,
  }
);
