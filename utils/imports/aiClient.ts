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
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 8000;
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
        body: JSON.stringify({ rows: batch, categories }),
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
