import { describe, expect, it } from 'vitest';
import { parseOrderHistory } from './orderHistory.js';

// Invented rows in the export's layout (extra columns are dropped).
const HEADER =
  'Website,Order ID,Order Date,Purchase Order Number,Currency,Unit Price,Unit Price Tax,Shipping Charge,Total Discounts,Total Amount,Shipment Item Subtotal,Shipment Item Subtotal Tax,ASIN,Product Condition,Quantity,Payment Method Type,Order Status,Shipment Status,Ship Date,Shipping Option,Shipping Address,Billing Address,Carrier Name & Tracking Number,Product Name,Gift Message,Gift Sender Name,Gift Recipient Contact,Item Serial Number,Original Quantity';
const row = (o: Record<string, string>) =>
  [
    'example.com',
    o.id ?? '111-0000001-0000001',
    o.ordered ?? '2026-03-02T10:00:00Z',
    'Not Applicable',
    o.currency ?? 'USD',
    '10',
    '0.80',
    '0',
    o.discount ?? '0',
    o.total ?? '10.80',
    '10',
    '0.80',
    o.asin ?? 'B000TEST01',
    'New',
    '1',
    o.pay ?? 'CardBrand - 0001',
    o.status ?? 'Closed',
    'Shipped',
    o.shipped ?? '2026-03-03T08:00:00Z',
    'std',
    '1 Test Street',
    '1 Test Street',
    'CARRIER(000)',
    o.name ?? 'Test Widget',
    'Not Available',
    'Not Available',
    'Not Available',
    'Not Available',
    o.qty ?? '1',
  ]
    .map((v) => `"${v}"`)
    .join(',');
const file = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('parseOrderHistory', () => {
  it('keeps only what matching needs', () => {
    const result = parseOrderHistory(file(row({ qty: '2', total: '21.60' })));
    expect(result).toEqual({
      ok: true,
      cancelled: 0,
      items: [
        {
          orderId: '111-0000001-0000001',
          asin: 'B000TEST01',
          productName: 'Test Widget',
          orderDate: '2026-03-02',
          shipDate: '2026-03-03',
          currency: 'USD',
          totalCents: 2160,
          quantity: 2,
          paymentMethod: 'CardBrand - 0001',
          fingerprint: '111-0000001-0000001|B000TEST01|2026-03-03|2160|1',
        },
      ],
    });
  });

  it('drops cancelled items and reads unshipped and twice-shipped dates', () => {
    const result = parseOrderHistory(
      file(
        row({ status: 'Cancelled' }),
        row({ shipped: 'Not Available', asin: 'B000TEST02' }),
        row({
          shipped: '2026-03-05T01:00:00.000Z and 2026-03-07T01:00:00Z',
          asin: 'B000TEST03',
        }),
      ),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.cancelled).toBe(1);
    expect(result.items.map((i) => i.shipDate)).toEqual([null, '2026-03-05']);
  });

  it('reads quoted negative discounts and tells identical rows apart', () => {
    const result = parseOrderHistory(file(row({ discount: "'-1.00'" }), row({})));
    if (!result.ok) throw new Error('expected ok');
    expect(result.items.map((i) => i.fingerprint.slice(-2))).toEqual(['|1', '|2']);
  });

  it('rejects a file that is not the order history', () => {
    const result = parseOrderHistory('Date,Description,Amount\n01/01/2026,X,1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toMatch(/Order History\.csv/);
  });

  it('reports rows with no total', () => {
    const result = parseOrderHistory(file(row({ total: 'n/a' })));
    expect(result).toEqual({
      ok: false,
      errors: [{ line: 2, message: 'Needs an order id, an order date and a total amount' }],
    });
  });
});
