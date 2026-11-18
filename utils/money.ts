import { DataTypes } from 'sequelize';

// Money columns: exact decimals to the cent in the database (numeric(12,2)).
// Postgres hands them over as strings ("12.50"); the getter turns them into
// numbers, so the API keeps sending amounts as numbers. Totals are added in
// whole cents (toCents), never as floats.
export const moneyColumn = (
  field: string,
  options: { allowNull?: boolean; defaultValue?: number } = {},
) => ({
  type: DataTypes.DECIMAL(12, 2),
  allowNull: options.allowNull ?? false,
  ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
  get(this: { getDataValue: (key: string) => unknown }) {
    const value = this.getDataValue(field);
    return value === null || value === undefined ? value : Number(value);
  },
});

export const toCents = (amount: number | string | null | undefined) => {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

export const fromCents = (cents: number) => cents / 100;
