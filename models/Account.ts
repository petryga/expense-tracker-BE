import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Account extends Model {
  declare id: string;
  declare name: string;
  declare currency: string;
  declare isDefault: boolean;
  declare userId: string | null;
}

Account.init(
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
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
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
    tableName: 'accounts',
    underscored: true,
    sequelize,
  },
);
