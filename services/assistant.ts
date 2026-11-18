import { Router } from 'express';
import { isDemoUser } from '../utils/importAccess.js';
import {
  askAssistant,
  assistantConfig,
  AssistantUnavailableError,
  type ChatTurn,
} from '../utils/assistant/client.js';
import { hasQuota, takeQuota } from '../utils/dailyLimit.js';
import { handleError } from '../utils/common.js';

// The spending assistant (PLANS.md, Plan 2). Read-only: it answers questions
// about the user's data and never changes anything.
const router = Router();

const MAX_QUESTION = 500;
const MAX_TURN = 4000;
const MAX_HISTORY = 20;

// The public demo account is one login shared by every visitor, so its
// questions are limited per visitor (by IP) and in total per day, on top of
// the spend limit on the API key. Off unless AI_ASSISTANT_DEMO_ENABLED=true.
const demoLimits = () => ({
  perVisitor: Number(process.env.AI_ASSISTANT_DEMO_PER_VISITOR) || 5,
  total: Number(process.env.AI_ASSISTANT_DEMO_DAILY_LIMIT) || 50,
});

const available = (userId: string | null) =>
  !!assistantConfig() && (!isDemoUser(userId) || process.env.AI_ASSISTANT_DEMO_ENABLED === 'true');

router.get('/', (req, res) => {
  const enabled = available(req.userId);
  res.json(
    enabled && isDemoUser(req.userId)
      ? { enabled, perVisitorDailyLimit: demoLimits().perVisitor }
      : { enabled },
  );
});

// Takes one question from the asker's quotas, or says which one is used up.
const takeQuestion = (
  userId: string | null,
  ip: string | undefined,
  dailyLimit: number,
): string | null => {
  if (!isDemoUser(userId)) {
    return takeQuota('assistant', userId, 1, dailyLimit)
      ? null
      : `That's ${dailyLimit} questions today. Try again tomorrow.`;
  }
  const { perVisitor, total } = demoLimits();
  const visitor = ip ?? 'unknown';
  if (!hasQuota('assistant-demo-visitor', visitor, 1, perVisitor)) {
    return `The demo answers ${perVisitor} questions per visitor a day. Try again tomorrow.`;
  }
  if (!hasQuota('assistant-demo', userId, 1, total)) {
    return `The demo has answered its ${total} questions for today. Try again tomorrow.`;
  }
  takeQuota('assistant-demo-visitor', visitor, 1, perVisitor);
  takeQuota('assistant-demo', userId, 1, total);
  return null;
};

const parseHistory = (value: unknown): ChatTurn[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    const { role, text } = (item ?? {}) as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string') return null;
    if (!text.trim() || text.length > MAX_TURN) return null;
    turns.push({ role, text });
  }
  return turns;
};

router.post('/', async (req, res) => {
  const config = assistantConfig();
  if (!config || !available(req.userId)) {
    return res.status(403).json({ error: 'The assistant is not available' });
  }
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const history = parseHistory(req.body?.history);
  if (!question || question.length > MAX_QUESTION || !history) {
    return res.status(400).json({
      error: `Ask a question of up to ${MAX_QUESTION} characters (history: up to ${MAX_HISTORY} turns)`,
    });
  }
  const limitReached = takeQuestion(req.userId, req.ip, config.dailyLimit);
  if (limitReached) return res.status(429).json({ error: limitReached });
  // The user's own token, so the assistant reads only what they can.
  const auth = req.header('authorization');
  const userToken = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
  try {
    res.json(await askAssistant(config, question, history, userToken, req.id as string));
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      return res.status(503).json({ error: 'The assistant is unavailable right now' });
    }
    handleError(res, error, 'Failed to ask the assistant');
  }
});

export default router;
