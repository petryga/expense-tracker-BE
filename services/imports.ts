import { Router, type Response } from 'express';
import { Currency } from '../models/Expense.js';
import { handleError } from '../utils/common.js';
import { canImportSample, canUploadStatements } from '../utils/importAccess.js';
import { SAMPLE_STATEMENT_CSV, SAMPLE_STATEMENT_NAME } from '../utils/sampleStatement.js';
import { confirmImport, type ConfirmDecision } from '../utils/imports/confirm.js';
import { deleteImport } from '../utils/imports/delete.js';
import { ImportInputError, ImportNotFoundError } from '../utils/imports/errors.js';
import { getImport, listImports } from '../utils/imports/read.js';
import { reopenRows } from '../utils/imports/reopen.js';
import { suggestForImport } from '../utils/imports/suggest.js';
import { uploadStatement } from '../utils/imports/upload.js';

// Statement import (PLANS.md, Plan 3 Phase A): upload an Amex CSV, review the
// drafts, confirm. Nothing becomes an expense without a confirm.
const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['save', 'skip', 'return']);

const fail = (res: Response, error: unknown, message: string) => {
  if (error instanceof ImportInputError) {
    return res.status(400).json({ error: error.message, details: error.details ?? [] });
  }
  if (error instanceof ImportNotFoundError) return res.status(404).json({ error: error.message });
  return handleError(res, error, message);
};

router.get('/', async (req, res) => {
  try {
    res.json({
      data: await listImports(req.userId),
      uploadAllowed: canUploadStatements(req.userId),
      sampleAvailable: canImportSample(req.userId),
    });
  } catch (error) {
    fail(res, error, 'Failed to fetch imports');
  }
});

// The demo account's only way in: the bundled synthetic statement.
router.post('/sample', async (req, res) => {
  if (!canImportSample(req.userId)) {
    return res.status(403).json({ error: 'The sample statement is only for the demo account' });
  }
  try {
    const { id, rowCount } = await uploadStatement(req.userId, {
      fileName: SAMPLE_STATEMENT_NAME,
      csv: SAMPLE_STATEMENT_CSV,
      account: 'Acme Credit Card',
      currency: Currency.USD,
    });
    if (!id) return res.status(200).json({ id: null, rowCount, duplicateCount: rowCount });
    res.status(201).json(await getImport(req.userId, id));
  } catch (error) {
    fail(res, error, 'Failed to import the sample statement');
  }
});

router.post('/', async (req, res) => {
  if (!canUploadStatements(req.userId)) {
    return res.status(403).json({ error: 'Statement upload is not enabled for this account' });
  }
  const {
    fileName,
    csv,
    account = 'Amex',
    currency = Currency.USD,
  } = req.body as Record<string, unknown>;
  if (typeof csv !== 'string' || !csv.trim()) {
    return res.status(400).json({ error: 'csv (the file contents) is required' });
  }
  if (typeof account !== 'string' || !account.trim() || account.length > 100) {
    return res.status(400).json({ error: 'account must be a non-empty name' });
  }
  if (currency !== Currency.CAD && currency !== Currency.USD) {
    return res.status(400).json({ error: 'currency must be CAD or USD' });
  }
  const name =
    typeof fileName === 'string' && fileName.trim()
      ? fileName.trim().slice(0, 255)
      : 'statement.csv';

  try {
    const { id, rowCount } = await uploadStatement(req.userId, {
      fileName: name,
      csv,
      account: account.trim(),
      currency,
    });
    if (!id) return res.status(200).json({ id: null, rowCount, duplicateCount: rowCount });
    // Never fails the import: without suggestions the rows are simply blank.
    await suggestForImport(req.userId, id, req.id as string);
    res.status(201).json(await getImport(req.userId, id));
  } catch (error) {
    fail(res, error, 'Failed to import statement');
  }
});

router.get('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Import not found' });
  try {
    res.json(await getImport(req.userId, req.params.id));
  } catch (error) {
    fail(res, error, 'Failed to fetch import');
  }
});

// Skipped rows back to "to review".
router.post('/:id/reopen', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Import not found' });
  const { rowIds } = req.body as { rowIds?: unknown };
  if (
    !Array.isArray(rowIds) ||
    !rowIds.length ||
    !rowIds.every((id) => typeof id === 'string' && UUID.test(id))
  ) {
    return res.status(400).json({ error: 'rowIds must be a non-empty list of row ids' });
  }
  try {
    const result = await reopenRows(req.userId, req.params.id, [...new Set(rowIds as string[])]);
    res.json({ ...result, import: await getImport(req.userId, req.params.id) });
  } catch (error) {
    fail(res, error, 'Failed to reopen rows');
  }
});

router.post('/:id/confirm', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Import not found' });
  const { rows } = req.body as { rows?: unknown };
  const valid =
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        UUID.test(r.id) &&
        ACTIONS.has(r.action) &&
        (r.category === undefined || typeof r.category === 'string') &&
        (r.description === undefined || typeof r.description === 'string'),
    );
  if (!valid) {
    return res.status(400).json({
      error: 'rows must be a non-empty list of { id, action: save|skip|return, category? }',
    });
  }
  if (new Set(rows.map((r: ConfirmDecision) => r.id)).size !== rows.length) {
    return res.status(400).json({ error: 'Each row can appear only once' });
  }

  try {
    const result = await confirmImport(req.userId, req.params.id, rows as ConfirmDecision[]);
    res.json({ ...result, import: await getImport(req.userId, req.params.id) });
  } catch (error) {
    fail(res, error, 'Failed to confirm import');
  }
});

router.delete('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Import not found' });
  try {
    const keepExpenses = req.query.keepExpenses === 'true';
    res.json(await deleteImport(req.userId, req.params.id, { keepExpenses }));
  } catch (error) {
    fail(res, error, 'Failed to delete import');
  }
});

export default router;
