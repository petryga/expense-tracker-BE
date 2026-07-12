import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

export enum MonthlyDataTypes {
  Expense = 'expense',
  Income = 'income',
}

export class MonthlyData extends Model {
  declare id: number;
  declare type: MonthlyDataTypes;
  declare amountCad: number;
  declare amountUsd: number;
  declare yearMonth: string;
  declare month: number;
  declare userId: string;
}

MonthlyData.init(
  {
    id: {
      type: DataTypes.UUID,
      autoIncrement: true,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    type: {
      type: DataTypes.ENUM,
      values: [MonthlyDataTypes.Expense, MonthlyDataTypes.Income],
      allowNull: false,
    },
    amountCad: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      defaultValue: 0,
    },
    amountUsd: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      defaultValue: 0,
    },
    yearMonth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'monthly_data',
    underscored: true,
    sequelize,
  }
);
