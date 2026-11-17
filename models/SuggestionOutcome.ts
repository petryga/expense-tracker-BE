import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// What was suggested for a purchase saved on review; see the migration.
export class SuggestionOutcome extends Model {
  declare id: string;
  declare userId: string | null;
  declare kind: 'statement' | 'item';
  declare ref: string;
  declare postedDate: string;
  declare suggestedCategory: string | null;
  declare suggestionSource: string | null;
  declare expenseId: string;
  declare importedAt: Date;
}

SuggestionOutcome.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.STRING, allowNull: false },
    ref: { type: DataTypes.STRING, allowNull: false },
    postedDate: { type: DataTypes.STRING, allowNull: false },
    suggestedCategory: { type: DataTypes.STRING, allowNull: true },
    suggestionSource: { type: DataTypes.STRING, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: false },
    importedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'suggestion_outcomes', underscored: true, sequelize },
);
