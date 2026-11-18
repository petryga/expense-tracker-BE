import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// A marketplace the user buys on (Settings). See utils/marketplaces.ts.
export class Marketplace extends Model {
  declare id: string;
  declare userId: string | null;
  declare name: string;
}

Marketplace.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
  },
  { tableName: 'marketplaces', underscored: true, sequelize },
);
