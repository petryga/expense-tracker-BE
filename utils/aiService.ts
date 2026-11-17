// How BE/ reaches the AI service (AI/): its URL and shared secret, and one
// JSON request with a timeout. Callers decide what a failure means; every
// caller treats the service like a third party that may be down.

export interface AiService {
  url: string;
  secret: string;
}

// The service's address and secret, or null when either is missing.
export const aiService = (): AiService | null => {
  const url = process.env.AI_SERVICE_URL?.replace(/\/+$/, '');
  const secret = process.env.AI_SHARED_SECRET;
  return url && secret ? { url, secret } : null;
};

export const callAiService = (
  service: AiService,
  path: string,
  body: unknown,
  options: { method?: 'POST' | 'PUT'; timeoutMs: number; requestId?: string },
) =>
  fetch(`${service.url}${path}`, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Secret': service.secret,
      ...(options.requestId ? { 'X-Request-Id': options.requestId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs),
  });

// What a thrown fetch error was, for logs.
export const failureOutcome = (error: unknown) =>
  (error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network_error';
