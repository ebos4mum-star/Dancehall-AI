import { describe, expect, it } from 'vitest';
import {
  buildAlert,
  createAlerter,
  createHttpEmailSender,
  type AlertEmail,
} from './community-alerts';

const summary = { open: 5, urgent: 2, urgentOverTarget: 1, overTarget: 0 };
const on = {
  enabled: '1',
  recipients: 'mod@example.test, backup@example.test',
  from: 'alerts@example.test',
  apiUrl: 'https://mail.example.test/send',
  apiKey: 'key-123',
};

describe('alert text', () => {
  it('holds counts and a link only, never member content', () => {
    for (const kind of ['new_urgent_report', 'urgent_reminder'] as const) {
      const m = buildAlert(kind, summary, 'https://admin.example.test/moderation');
      const all = `${m.subject}\n${m.text}`;
      expect(all).toContain('https://admin.example.test/moderation');
      expect(all).toMatch(/Urgent items waiting: 2/);
      expect(all).toMatch(/no member content/);
      expect(all).not.toMatch(/@\w+_|username|reason/i);
    }
  });
  it('reads naturally for one item', () => {
    expect(buildAlert('urgent_reminder', { ...summary, urgent: 1 }, null).subject).toMatch(
      /1 urgent Community item is still waiting/,
    );
  });
});

describe('alerter', () => {
  it('is off unless explicitly switched on, with a reason and no sending', async () => {
    const sent: AlertEmail[] = [];
    const sender = { send: async (m: AlertEmail) => void sent.push(m) };
    for (const cfg of [
      { ...on, enabled: undefined },
      { ...on, enabled: 'true' },
      { ...on, enabled: '0' },
    ]) {
      const a = createAlerter(cfg, sender);
      expect(a.enabled).toBe(false);
      expect(await a.notify('new_urgent_report', summary)).toBe(false);
    }
    expect(sent).toHaveLength(0);
  });
  it('stays off without valid recipients or an approved provider', () => {
    expect(createAlerter({ ...on, recipients: '' }).reason).toMatch(/recipients/);
    expect(createAlerter({ ...on, recipients: 'not-an-address' }).enabled).toBe(false);
    expect(createAlerter({ ...on, apiKey: undefined }).reason).toMatch(/provider/);
    expect(createAlerter({ ...on, apiUrl: undefined }).enabled).toBe(false);
    expect(createAlerter({ ...on, from: 'nope' }).enabled).toBe(false);
    expect(createAlerter({ ...on, apiUrl: 'http://mail.example.test/send' }).reason).toMatch(
      /https/,
    );
  });
  it('sends to the primary and backup when configured', async () => {
    const sent: AlertEmail[] = [];
    const a = createAlerter(on, { send: async (m) => void sent.push(m) });
    expect(a.enabled).toBe(true);
    expect(await a.notify('new_urgent_report', summary)).toBe(true);
    expect(sent[0]!.to).toEqual(['mod@example.test', 'backup@example.test']);
  });
  it('never raises when the provider fails', async () => {
    const a = createAlerter(on, {
      send: async () => {
        throw new Error('boom: secret key-123');
      },
    });
    await expect(a.notify('new_urgent_report', summary)).resolves.toBe(false);
  });
  it('the HTTP sender posts the mail with the key as a bearer token and fails closed', async () => {
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> =
      [];
    const ok = createHttpEmailSender({
      apiUrl: 'https://mail.example.test/send',
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: (async (url: string, init: never) => {
        calls.push({ url, init });
        return { ok: true };
      }) as unknown as typeof fetch,
    });
    await ok.send({ to: ['m@example.test'], subject: 's', text: 't' });
    expect(calls[0]!.init.headers.authorization).toBe('Bearer k');
    expect(JSON.parse(calls[0]!.init.body)).toEqual({
      from: 'a@example.test',
      to: ['m@example.test'],
      subject: 's',
      text: 't',
    });
    const bad = createHttpEmailSender({
      apiUrl: 'https://x.test',
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: (async () => ({ ok: false })) as unknown as typeof fetch,
    });
    await expect(bad.send({ to: ['m@example.test'], subject: 's', text: 't' })).rejects.toThrow(
      'email_failed',
    );
  });
});
