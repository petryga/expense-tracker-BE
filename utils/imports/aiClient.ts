import { logger } from '../logger.js';

// The one place BE/ talks to the AI service (PLANS.md, Plan 3, decisions 11
// and 13). It treats the service like any third party: a short timeout, the
// answer's shape is checked, and only categories the user actually has are
// kept. It never throws: any failure means "no suggestions", and the import
// carries on exactly as without the feature.

export interface SuggestionRequestRow {
  id: string;
  text: string;
  amountCents: number;
  bankCategory?: string;
  // An order item: the text is a product name, and the service shows the
  // model the user's past choices for similar products.
  kind?: 'item';
}

// A past choice: what the user filed a product under.
export interface ItemExample {
  source: string;
  text: string;
  category: string;
}

export interface AiConfig {
  url: string;
  secret: string;
  timeoutMs: number;
}

// Off unless explicitly on and fully configured.
export const aiConfig = (): AiConfig | null => {
  if (process.env.AI_CATEGORIZE_ENABLED !== 'true') return null;
  const url = process.env.AI_SERVICE_URL?.replace(/\/+$/, '');
  const secret = process.env.AI_SHARED_SECRET;
  if (!url || !secret) return null;
  // Suggestions run in the background, so the limit is generous: a local model
  // needs 1-3 minutes for a month of rows, Claude a few seconds.
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 300_000;
  return { url, secret, timeoutMs };
};

const MAX_ROWS_PER_CALL = 500;

type Outcome = 'ok' | 'timeout' | 'http_error' | 'bad_response' | 'network_error';

// Checks the response against the contract and the user's categories.
// Returns null when the response as a whole can't be trusted.
export const validateSuggestions = (
  body: unknown,
  requestedIds: Set<string>,
  categories: Set<string>,
): Map<string, string> | null => {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { suggestions?: unknown }).suggestions)
  ) {
    return null;
  }
  const result = new Map<string, string>();
  for (const item of (body as { suggestions: unknown[] }).suggestions) {
    if (!item || typeof item !== 'object') return null;
    const { id, category, source } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !requestedIds.has(id)) return null;
    if (category === null || source !== 'model') continue;
    // A category the user doesn't have is dropped, not passed on.
    if (typeof category === 'string' && categories.has(category)) result.set(id, category);
  }
  return result;
};

export const requestSuggestions = async (
  config: AiConfig,
  rows: SuggestionRequestRow[],
  categories: string[],
  requestId: string | undefined,
  userId: string | null = null,
): Promise<Map<string, string>> => {
  const suggestions = new Map<string, string>();
  if (!rows.length || !categories.length) return suggestions;
  const allowed = new Set(categories);
  const started = Date.now();
  let outcome: Outcome = 'ok';

  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_CALL) {
    const batch = rows.slice(i, i + MAX_ROWS_PER_CALL);
    try {
      const res = await fetch(`${config.url}/categorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Secret': config.secret,
          ...(requestId ? { 'X-Request-Id': requestId } : {}),
        },
        body: JSON.stringify({ rows: batch, categories, userId }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!res.ok) {
        outcome = 'http_error';
        break;
      }
      const valid = validateSuggestions(await res.json(), new Set(batch.map((r) => r.id)), allowed);
      if (!valid) {
        outcome = 'bad_response';
        break;
      }
      valid.forEach((category, id) => suggestions.set(id, category));
    } catch (error) {
      outcome = (error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network_error';
      break;
    }
  }

  // Counts and timing only: no descriptions, amounts or categories in logs.
  const log = {
    outcome,
    rows: rows.length,
    suggested: suggestions.size,
    ms: Date.now() - started,
    requestId,
  };
  if (outcome === 'ok') logger.info(log, 'AI suggestions');
  else logger.warn(log, 'AI suggestions unavailable; importing without them');
  return outcome === 'ok' ? suggestions : new Map();
};

const MAX_EXAMPLES = 5000;

// Sends every past item choice of the user, so the service's stored set
// matches what the app holds now (edits and deletions included). Never
// throws: without it, items are simply suggested without examples.
export const syncItemExamples = async (
  config: AiConfig,
  userId: string | null,
  examples: ItemExample[],
  requestId: string | undefined,
): Promise<boolean> => {
  const started = Date.now();
  let outcome: Outcome = 'ok';
  try {
    const res = await fetch(`${config.url}/examples`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Secret': config.secret,
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({ userId, examples: examples.slice(0, MAX_EXAMPLES) }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) outcome = 'http_error';
  } catch (error) {
    outcome = (error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network_error';
  }
  // Counts and timing only.
  const log = { outcome, examples: examples.length, ms: Date.now() - started, requestId };
  if (outcome === 'ok') logger.info(log, 'AI examples synced');
  else logger.warn(log, 'AI examples not synced; suggesting without them');
  return outcome === 'ok';
};
