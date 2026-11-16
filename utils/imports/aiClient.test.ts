import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiConfig, requestSuggestions, validateSuggestions } from './aiClient.js';

const CONFIG = { url: 'http://ai.test', secret: 's3cret', timeoutMs: 50 };
const ROWS = [
  { id: 'a', text: 'GREENLEAF MARKET', amountCents: 8642 },
  { id: 'b', text: 'AMAZON.COM*DEMO1', amountCents: 3499 },
];
const CATEGORIES = ['Groceries', 'Clothing'];

const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('aiConfig', () => {
  it('is off unless enabled and fully configured', () => {
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'true');
    vi.stubEnv('AI_SERVICE_URL', 'http://ai.test/');
    vi.stubEnv('AI_SHARED_SECRET', '');
    expect(aiConfig()).toBeNull();
    vi.stubEnv('AI_SHARED_SECRET', 'x');
    expect(aiConfig()).toEqual({ url: 'http://ai.test', secret: 'x', timeoutMs: 300_000 });
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    expect(aiConfig()).toBeNull();
  });
});

describe('requestSuggestions', () => {
  it('sends the rows, categories, secret and request id, and keeps model suggestions', async () => {
    const fetchMock = answer({
      suggestions: [
        { id: 'a', category: 'Groceries', source: 'model' },
        { id: 'b', category: null, source: 'none' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestSuggestions(CONFIG, ROWS, CATEGORIES, 'req-1');

    expect([...result]).toEqual([['a', 'Groceries']]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ai.test/categorize');
    expect(init.headers).toMatchObject({ 'X-AI-Secret': 's3cret', 'X-Request-Id': 'req-1' });
    expect(JSON.parse(init.body as string)).toEqual({ rows: ROWS, categories: CATEGORIES });
  });

  it('drops a category the user does not have', async () => {
    vi.stubGlobal(
      'fetch',
      answer({ suggestions: [{ id: 'a', category: 'Yachts', source: 'model' }] }),
    );
    expect((await requestSuggestions(CONFIG, ROWS, CATEGORIES, undefined)).size).toBe(0);
  });

  it.each([
    ['an HTTP error', () => answer({ error: 'boom' }, 500)],
    ['a malformed body', () => answer({ nope: true })],
    [
      'an id it was not asked about',
      () => answer({ suggestions: [{ id: 'zzz', category: 'Groceries', source: 'model' }] }),
    ],
    ['a network error', () => vi.fn(async () => Promise.reject(new TypeError('fetch failed')))],
    [
      'a timeout',
      () =>
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) =>
              init.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
            ),
        ),
    ],
  ])('returns no suggestions at all on %s, without throwing', async (_name, make) => {
    vi.stubGlobal('fetch', make());
    await expect(requestSuggestions(CONFIG, ROWS, CATEGORIES, undefined)).resolves.toEqual(
      new Map(),
    );
  });

  it('does not call the service when there is nothing to ask', async () => {
    const fetchMock = answer({ suggestions: [] });
    vi.stubGlobal('fetch', fetchMock);
    await requestSuggestions(CONFIG, [], CATEGORIES, undefined);
    await requestSuggestions(CONFIG, ROWS, [], undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('validateSuggestions', () => {
  it('rejects a response that is not the contract shape', () => {
    const ids = new Set(['a']);
    const cats = new Set(['Groceries']);
    expect(validateSuggestions(null, ids, cats)).toBeNull();
    expect(validateSuggestions({ suggestions: [42] }, ids, cats)).toBeNull();
    expect(validateSuggestions({ suggestions: [{ id: 7 }] }, ids, cats)).toBeNull();
  });
});
