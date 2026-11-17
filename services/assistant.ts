import { Router } from 'express';
import { isDemoUser } from '../utils/importAccess.js';
import {
  askAssistant,
  assistantConfig,
  AssistantUnavailableError,
  type ChatTurn,
} from '../utils/assistant/client.js';
import { takeQuestion } from '../utils/assistant/dailyLimit.js';
import { handleError } from '../utils/common.js';

// The spending assistant (PLANS.md, Plan 2). Read-only: it answers questions
// about the user's data and never changes anything.
const router = Router();

const MAX_QUESTION = 500;
const MAX_TURN = 4000;
const MAX_HISTORY = 20;

// The demo account doesn't get it yet: every question costs money.
const available = (userId: string | null) => !!assistantConfig() && !isDemoUser(userId);

router.get('/', (req, res) => {
  res.json({ enabled: available(req.userId) });
});

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
  if (!config || isDemoUser(req.userId)) {
    return res.status(403).json({ error: 'The assistant is not available' });
  }
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const history = parseHistory(req.body?.history);
  if (!question || question.length > MAX_QUESTION || !history) {
    return res.status(400).json({
      error: `Ask a question of up to ${MAX_QUESTION} characters (history: up to ${MAX_HISTORY} turns)`,
    });
  }
  if (!takeQuestion(req.userId, config.dailyLimit)) {
    return res
      .status(429)
      .json({ error: `That's ${config.dailyLimit} questions today. Try again tomorrow.` });
  }
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
