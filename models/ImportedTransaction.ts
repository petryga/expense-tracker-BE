import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import type { TransactionKind } from '../utils/statementParsers/types.js';

export type ImportStatus = 'draft' | 'saved' | 'skipped' | 'returned';
export type SuggestionStatus = 'pending' | 'done' | 'none';

export class ImportedTransaction extends Model {
  declare id: string;
  declare userId: string | null;
  declare batchId: string;
  declare line: number;
  declare fingerprint: string;
  declare reference: string | null;
  declare postedDate: string;
  declare description: string;
  declare merchantKey: string;
  declare amountCents: number;
  declare raw: Record<string, string>;
  declare kind: TransactionKind;
  declare status: ImportStatus;
  declare category: string | null;
  declare expenseId: string | null;
  declare matchedTransactionId: string | null;
  declare suggestedCategory: string | null;
  declare suggestionSource: string | null;
  declare suggestionStatus: SuggestionStatus | null;
  declare updatedAt: Date;
}

ImportedTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    batchId: { type: DataTypes.UUID, allowNull: false },
    line: { type: DataTypes.INTEGER, allowNull: false },
    fingerprint: { type: DataTypes.STRING, allowNull: false },
    reference: { type: DataTypes.STRING, allowNull: true },
    postedDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.STRING(512), allowNull: false },
    merchantKey: { type: DataTypes.STRING, allowNull: false },
    amountCents: { type: DataTypes.INTEGER, allowNull: false },
    raw: { type: DataTypes.JSONB, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: true },
    matchedTransactionId: { type: DataTypes.UUID, allowNull: true },
    suggestedCategory: { type: DataTypes.STRING, allowNull: true },
    suggestionSource: { type: DataTypes.STRING, allowNull: true },
    suggestionStatus: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'imported_transactions', underscored: true, sequelize },
);
