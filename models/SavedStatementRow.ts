import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import type { TransactionKind } from '../utils/statementParsers/types.js';

// A statement row saved as an expense, kept after its import is deleted.
// 'import': saved on review. 'label': loaded from the hand-labelled set, for
// merchant memory only.
export class SavedStatementRow extends Model {
  declare id: string;
  declare userId: string | null;
  declare fingerprint: string;
  declare description: string;
  declare kind: TransactionKind;
  declare expenseId: string | null;
  declare category: string | null;
  declare source: 'import' | 'label';
  declare chosenAt: Date;
}

SavedStatementRow.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    fingerprint: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING(512), allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    expenseId: { type: DataTypes.UUID, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: true },
    source: { type: DataTypes.STRING, allowNull: false },
    chosenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'saved_statement_rows', underscored: true, sequelize },
);
