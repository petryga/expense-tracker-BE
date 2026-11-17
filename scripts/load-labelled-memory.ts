// One-time, local: loads the hand-labelled statement rows (AI/data/labels.csv)
// into merchant memory, so it does not start empty (PLANS.md,
// "Improvements", 1). For the single local user (auth off).
//
//   npx tsx scripts/load-labelled-memory.ts <labels.csv>
//
// Safe to re-run: the loaded rows are replaced each time. Only checked rows
// with a category are loaded, never "can't tell" or a general marketplace.
// They teach memory only; re-uploading the same statement still offers them.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { sequelize } from '../config/database.js';
import { SavedStatementRow } from '../models/SavedStatementRow.js';
import { isMarketplace } from '../utils/imports/merchantMemory.js';

const CHECKED = new Set(['y', 'yes', 'x', '1', 'true']);
const CANT_TELL = "can't tell";

const main = async () => {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npx tsx scripts/load-labelled-memory.ts <labels.csv>');
  const records = parse(readFileSync(path, 'utf8'), { columns: true }) as Record<string, string>[];
  const rows = records.filter((r) => {
    const label = r.label?.trim();
    return (
      CHECKED.has(r.checked?.trim().toLowerCase()) &&
      label &&
      label !== CANT_TELL &&
      !isMarketplace(r.description)
    );
  });
  await sequelize.transaction(async (transaction) => {
    await SavedStatementRow.destroy({ where: { userId: null, source: 'label' }, transaction });
    await SavedStatementRow.bulkCreate(
      rows.map((r) => ({
        id: randomUUID(),
        userId: null,
        fingerprint: `label:${r.reference.replace(/'/g, '').trim()}`,
        description: r.description.slice(0, 512),
        kind: 'charge',
        category: r.label.trim(),
        source: 'label',
        chosenAt: new Date(r.date),
      })),
      { transaction },
    );
  });
  console.log(`Loaded ${rows.length} labelled rows of ${records.length} into merchant memory.`);
  await sequelize.close();
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await sequelize.close();
  process.exit(1);
});
