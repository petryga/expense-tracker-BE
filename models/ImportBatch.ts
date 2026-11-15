import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class ImportBatch extends Model {
  declare id: string;
  declare userId: string | null;
  declare source: string;
  declare fileName: string;
  declare account: string;
  declare currency: string;
  declare rowCount: number;
  // BIGINT comes back from pg as a string.
  declare fileTotalCents: string | number;
  declare duplicateCount: number;
  declare duplicateTotalCents: string | number;
  declare createdAt: Date;
}

ImportBatch.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    source: { type: DataTypes.STRING, allowNull: false },
    fileName: { type: DataTypes.STRING, allowNull: false },
    account: { type: DataTypes.STRING, allowNull: false },
    currency: { type: DataTypes.STRING, allowNull: false },
    rowCount: { type: DataTypes.INTEGER, allowNull: false },
    fileTotalCents: { type: DataTypes.BIGINT, allowNull: false },
    duplicateCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duplicateTotalCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'import_batches', underscored: true, sequelize },
);
