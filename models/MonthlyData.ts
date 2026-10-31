import { Model, DataTypes, UniqueConstraintError, type Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';

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

  // Find the rollup row for (user, type, month) or create it, safely under
  // concurrency. The unique index makes a losing racer's INSERT fail, which in
  // Postgres aborts the whole surrounding transaction unless the INSERT runs
  // in its own savepoint, so it does. On a conflict the winner's (by then
  // committed) row is re-read and handed back with created = false so the
  // caller adds its amount to it.
  //
  // Not Sequelize's findOrCreate: its unique-violation recovery calls
  // `.toString()` on each conflicting column value and throws a TypeError when
  // user_id is NULL, which is every row in no-auth/local mode.
  static async findOrCreateRow({
    where,
    defaults,
    transaction,
  }: {
    where: { yearMonth: string; type: MonthlyDataTypes; userId: string | null };
    defaults: { amountCad: number; amountUsd: number };
    transaction?: Transaction;
  }): Promise<[MonthlyData, boolean]> {
    const existing = await MonthlyData.findOne({ where, transaction });
    if (existing) return [existing, false];

    try {
      const created = await sequelize.transaction({ transaction }, (savepoint) =>
        MonthlyData.create({ ...where, ...defaults }, { transaction: savepoint }),
      );
      return [created, true];
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const winner = await MonthlyData.findOne({ where, transaction });
      if (!winner) throw error;
      return [winner, false];
    }
  }
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
  },
);
