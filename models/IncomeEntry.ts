import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export enum Currency {
  CAD = 'CAD',
  USD = 'USD',
}

export class IncomeEntry extends Model {
  declare id: string;
  declare date: string;
  declare description: string;
  declare category: string;
  declare amount: string;
  declare currency: Currency | '';
  declare userId: string;
}

IncomeEntry.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    date: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: Currency.CAD,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'income_entries',
    underscored: true,
    sequelize,
  }
);
