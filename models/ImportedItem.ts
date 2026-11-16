import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import type { SuggestionStatus } from './ImportedTransaction.js';

// One item of a matched Amazon charge; saved as its own expense on review.
export class ImportedItem extends Model {
  declare id: string;
  declare userId: string | null;
  declare transactionId: string;
  declare orderItemId: string | null;
  declare position: number;
  declare description: string;
  declare amountCents: number;
  declare quantity: number;
  declare category: string | null;
  declare expenseId: string | null;
  declare suggestedCategory: string | null;
  declare suggestionSource: string | null;
  declare suggestionStatus: SuggestionStatus | null;
  // Returned on its own: a card refund (refundTransactionId) gave it back.
  declare status: 'returned' | null;
  declare refundTransactionId: string | null;
  declare updatedAt: Date;
}

ImportedItem.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    transactionId: { type: DataTypes.UUID, allowNull: false },
    orderItemId: { type: DataTypes.UUID, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(1024), allowNull: false },
    amountCents: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    category: { type: DataTypes.STRING, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: true },
    suggestedCategory: { type: DataTypes.STRING, allowNull: true },
    suggestionSource: { type: DataTypes.STRING, allowNull: true },
    suggestionStatus: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: true },
    refundTransactionId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'imported_items', underscored: true, sequelize },
);
