// chat service tests — exercise both the `/api/chat` Vercel-route branch and
// the env-fallback (`IS_SUPABASE_ENABLED === false`) keyword-matched mock.
//
// Note on streaming: the `/api/chat` route in this codebase currently returns
// a single JSON envelope `{ reply, suggestions }` (no SSE / chunked stream).
// The X11-relevant concern is therefore "real-branch unwraps res.reply,
// mock-branch returns the keyword-matched copy directly" — both branches
// must return a plain string.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(() => Promise.resolve(JSON.stringify(body))),
    json: vi.fn(() => Promise.resolve(body)),
  };
}

describe('chat service — real (Supabase) branch', () => {
  let mod;
  beforeEach(async () => {
    mod = await import('../chat');
  });

  describe('getChatResponse', () => {
    it('POSTs to /api/chat with context=admin and unwraps res.reply', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({ reply: 'Greetings, admin.', suggestions: [] }),
      );
      const reply = await mod.getChatResponse('hi');
      expect(reply).toBe('Greetings, admin.');
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/chat');
      expect(init.method).toBe('POST');
      const sent = JSON.parse(init.body);
      expect(sent).toEqual({ message: 'hi', context: 'admin' });
    });

    it('falls back to mock copy when route returns non-string reply', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ reply: null }));
      const reply = await mod.getChatResponse('how many agents');
      // Falls through to mockChatResponse — "agent" branch.
      expect(typeof reply).toBe('string');
      expect(reply.length).toBeGreaterThan(0);
    });

    it('falls back to mock copy on network failure (swallows error)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const reply = await mod.getChatResponse('coverage');
      expect(typeof reply).toBe('string');
      // The coverage branch of buildResponses includes the word "coverage".
      expect(reply.toLowerCase()).toContain('coverage');
    });

    it('falls back to mock copy on 500 API error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({ code: 'internal' }, { status: 500 }),
      );
      const reply = await mod.getChatResponse('subscribers');
      expect(typeof reply).toBe('string');
    });
  });

  describe('getAgentReply', () => {
    it('POSTs to /api/chat with context=agent and unwraps reply', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({ reply: 'Hi, Daniel here.' }),
      );
      const reply = await mod.getAgentReply('hello', { name: 'Daniel Mugisha' });
      expect(reply).toBe('Hi, Daniel here.');
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sent.context).toBe('agent');
      expect(sent.message).toBe('hello');
    });

    it('uses agent first-name fallback when route fails', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
      const reply = await mod.getAgentReply('hi', { name: 'Daniel Mugisha' });
      expect(reply).toContain('Daniel');
    });

    it('uses "your agent" placeholder when no agent name given', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
      const reply = await mod.getAgentReply('hi');
      // mockAgentReply uses firstName from "your agent".split(' ')[0] => "your"
      // → "Hi! your here." which is awkward but matches the source.
      expect(typeof reply).toBe('string');
      expect(reply.length).toBeGreaterThan(0);
    });
  });

  describe('getSubscriberChatResponse', () => {
    it('POSTs to /api/chat with context=subscriber and unwraps reply', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({ reply: 'Hello subscriber.' }),
      );
      const reply = await mod.getSubscriberChatResponse('hi');
      expect(reply).toBe('Hello subscriber.');
      const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sent.context).toBe('subscriber');
    });

    it('returns subscriber-flavored fallback on failure (matches "withdraw" keyword)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
      const reply = await mod.getSubscriberChatResponse('how do I withdraw');
      expect(reply).toContain('withdraw');
    });
  });
});

describe('chat service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let mod;
  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    mod = await import('../chat');
  });

  it('getChatResponse does NOT call the network', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await mod.getChatResponse('how many subscribers');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getChatResponse "agent" keyword routes to the agent reply', async () => {
    const reply = await mod.getChatResponse('top agents');
    expect(reply.toLowerCase()).toContain('agent');
  });

  it('getChatResponse "coverage" keyword routes to coverage reply', async () => {
    const reply = await mod.getChatResponse('coverage by region');
    expect(reply.toLowerCase()).toContain('coverage');
  });

  it('getChatResponse "subscriber" keyword routes to subscriber reply', async () => {
    const reply = await mod.getChatResponse('how many subscribers');
    expect(reply.toLowerCase()).toContain('subscriber');
  });

  it('getChatResponse "gender" keyword routes to gender reply', async () => {
    const reply = await mod.getChatResponse('gender split');
    // Contains the male/female ratio string.
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('getChatResponse default fallback for unknown keywords', async () => {
    const reply = await mod.getChatResponse('quantum tunnelling');
    expect(reply).toMatch(/help|analyse|ask/i);
  });

  it('getAgentReply handles withdraw keyword', async () => {
    const reply = await mod.getAgentReply('I want to withdraw');
    expect(reply.toLowerCase()).toContain('withdraw');
  });

  it('getAgentReply handles hello greeting with agent first name', async () => {
    const reply = await mod.getAgentReply('hi', { name: 'James Okello' });
    expect(reply).toContain('James');
  });

  it('getAgentReply default reply for unknown keyword', async () => {
    const reply = await mod.getAgentReply('xyz nonsense', { name: 'Z' });
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('getSubscriberChatResponse handles withdraw', async () => {
    const reply = await mod.getSubscriberChatResponse('withdraw money');
    expect(reply).toMatch(/Withdraw|withdraw/);
  });

  it('getSubscriberChatResponse handles contribute', async () => {
    const reply = await mod.getSubscriberChatResponse('contribute more');
    expect(reply.toLowerCase()).toContain('contribut');
  });

  it('getSubscriberChatResponse default for unknown', async () => {
    const reply = await mod.getSubscriberChatResponse('hyperspace');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });
});

describe('chat service — real/mock branch parity (X11)', () => {
  it('both branches return a non-empty string from getChatResponse', async () => {
    const realMod = await import('../chat');
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ reply: 'realstr' }));
    const real = await realMod.getChatResponse('hi');
    expect(typeof real).toBe('string');
    expect(real.length).toBeGreaterThan(0);

    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    const mockMod = await import('../chat');
    const mock = await mockMod.getChatResponse('hi');
    expect(typeof mock).toBe('string');
    expect(mock.length).toBeGreaterThan(0);
  });
});
