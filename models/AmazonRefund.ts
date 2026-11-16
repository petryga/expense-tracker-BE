import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// One refund from the user's uploaded Amazon refund list (PLANS.md, Phase D).
export class AmazonRefund extends Model {
  declare id: string;
  declare userId: string | null;
  declare fingerprint: string;
  declare orderId: string;
  declare amountCents: number;
  declare refundDate: string;
}

AmazonRefund.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    fingerprint: { type: DataTypes.STRING, allowNull: false },
    orderId: { type: DataTypes.STRING, allowNull: false },
    amountCents: { type: DataTypes.INTEGER, allowNull: false },
    refundDate: { type: DataTypes.DATEONLY, allowNull: false },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'amazon_refunds', underscored: true, sequelize },
);
