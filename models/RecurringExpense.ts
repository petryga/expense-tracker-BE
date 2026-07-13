import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export enum Currency {
  CAD = 'CAD',
  USD = 'USD',
}

export class RecurringExpense extends Model {
  declare id: string;
  declare category: string;
  declare amount: string;
  declare account: string;
  declare description: string;
  declare dayOfMonth: number;
  declare currency: Currency | '';
  declare userId: string | null;
}

RecurringExpense.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    account: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    dayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
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
    tableName: 'recurring_expenses',
    underscored: true,
    sequelize,
  }
);
