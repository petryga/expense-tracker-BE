import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// One item of the user's uploaded Amazon order history (PLANS.md, Phase D).
export class AmazonOrderItem extends Model {
  declare id: string;
  declare userId: string | null;
  declare fingerprint: string;
  declare orderId: string;
  declare asin: string;
  declare productName: string;
  declare orderDate: string;
  declare shipDate: string | null;
  declare currency: string;
  declare totalCents: number;
  declare quantity: number;
  declare paymentMethod: string;
}

AmazonOrderItem.init(
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
    asin: { type: DataTypes.STRING, allowNull: false },
    productName: { type: DataTypes.STRING(1024), allowNull: false },
    orderDate: { type: DataTypes.DATEONLY, allowNull: false },
    shipDate: { type: DataTypes.DATEONLY, allowNull: true },
    currency: { type: DataTypes.STRING, allowNull: false },
    totalCents: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    paymentMethod: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: 'amazon_order_items', underscored: true, sequelize },
);
