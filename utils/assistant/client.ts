import { logger } from '../logger.js';

// The spending assistant: BE/ checks who may ask and how often, then passes
// the question to the AI service, which answers by reading the user's data
// through the MCP server (PLANS.md, Plan 2). The user's own token goes along,
// so the assistant can only ever read what this user can.

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantReply {
  answer: string;
  outcome: string;
  toolCalls: string[];
}

export interface AssistantConfig {
  url: string;
  secret: string;
  timeoutMs: number;
  dailyLimit: number;
}

// Off unless explicitly on and the AI service is configured.
export const assistantConfig = (): AssistantConfig | null => {
  if (process.env.AI_ASSISTANT_ENABLED !== 'true') return null;
  const url = process.env.AI_SERVICE_URL?.replace(/\/+$/, '');
  const secret = process.env.AI_SHARED_SECRET;
  if (!url || !secret) return null;
  return {
    url,
    secret,
    // A question takes a few model calls and tool calls; the AI service gives
    // up at 60 s, so this only catches a service that never answers.
    timeoutMs: Number(process.env.AI_ASSISTANT_TIMEOUT_MS) || 90_000,
    dailyLimit: Number(process.env.AI_ASSISTANT_DAILY_LIMIT) || 50,
  };
};

export class AssistantUnavailableError extends Error {}

const isReply = (body: unknown): body is AssistantReply => {
  const b = body as Partial<AssistantReply> | null;
  return (
    !!b &&
    typeof b.answer === 'string' &&
    typeof b.outcome === 'string' &&
    Array.isArray(b.toolCalls) &&
    b.toolCalls.every((t) => typeof t === 'string')
  );
};

export const askAssistant = async (
  config: AssistantConfig,
  question: string,
  history: ChatTurn[],
  userToken: string | undefined,
  requestId: string | undefined,
): Promise<AssistantReply> => {
  const started = Date.now();
  let outcome = 'ok';
  try {
    const res = await fetch(`${config.url}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Secret': config.secret,
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({ question, history, ...(userToken ? { userToken } : {}) }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) {
      outcome = `http_${res.status}`;
      throw new AssistantUnavailableError();
    }
    const body: unknown = await res.json();
    if (!isReply(body)) {
      outcome = 'bad_response';
      throw new AssistantUnavailableError();
    }
    outcome = body.outcome;
    return { answer: body.answer, outcome: body.outcome, toolCalls: body.toolCalls };
  } catch (error) {
    if (error instanceof AssistantUnavailableError) throw error;
    outcome = (error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network_error';
    throw new AssistantUnavailableError();
  } finally {
    // Never the question or the answer.
    logger.info({ outcome, ms: Date.now() - started, requestId }, 'Assistant question');
  }
};
