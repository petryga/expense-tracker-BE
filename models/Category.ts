import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Category extends Model {
  declare id: string;
  declare name: string;
  declare parentCategoryId: string | null;
  declare isDefault: boolean;
  declare userId: string | null;
}

Category.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'categories',
    underscored: true,
    sequelize,
  }
);
