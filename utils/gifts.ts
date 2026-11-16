// Gifts are a flag on an expense, not a category: a gift is still Clothing or
// Pharmacy. Reports keep showing them as their own slice under this name.
export const GIFTS = 'Gifts';

// The category an expense counts under in reports and charts.
export const reportCategory = (
  category: string | null | undefined,
  isGift: boolean | null | undefined,
) => (isGift ? GIFTS : category?.trim() || 'Uncategorized');
