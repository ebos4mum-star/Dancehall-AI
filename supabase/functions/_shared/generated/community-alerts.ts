// GENERATED from packages/shared/src/community-alerts.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
// Email alerts to the moderator for urgent Community reports. DISABLED unless an approved provider and credentials are configured.
//
// Design:
//  * An alert says only THAT something urgent is waiting, how many, and where to look. It never contains a username, a post, a report note or anything a member wrote.
//  * Sending is best effort and never changes the outcome of a member's request (a failed email cannot make a report fail).
//  * Alerts are throttled by the server (one immediate alert per quarter hour, then a reminder digest from the scheduled job while urgent items stay open).
//  * The sender is a small interface. The only concrete sender is a generic HTTPS JSON sender whose address and key come from configuration: nothing is wired to any provider
//    until the owner approves one and sets its credentials. With no configuration `createAlerts` returns a disabled alerter that sends nothing.

export interface AlertEmail {
  to: string[];
  subject: string;
  text: string;
}
export interface EmailSender {
  send(mail: AlertEmail): Promise<void>;
}
export interface UrgentSummary {
  open: number;
  urgent: number;
  urgentOverTarget: number;
  overTarget: number;
}
export type AlertKind = 'new_urgent_report' | 'urgent_reminder';

/** The text of an alert. Counts and a link only. */
export function buildAlert(
  kind: AlertKind,
  s: UrgentSummary,
  consoleUrl: string | null,
): Omit<AlertEmail, 'to'> {
  const subject =
    kind === 'new_urgent_report'
      ? '[DanceHall Fit AI] An urgent Community report needs review'
      : `[DanceHall Fit AI] ${s.urgent} urgent Community ${s.urgent === 1 ? 'item is' : 'items are'} still waiting`;
  const lines = [
    kind === 'new_urgent_report'
      ? 'An urgent report was just made in Community.'
      : 'Urgent Community items are still open.',
    '',
    `Urgent items waiting: ${s.urgent}`,
    `Urgent items past the 4-hour target: ${s.urgentOverTarget}`,
    `All items waiting: ${s.open}`,
    `Ordinary items past the 48-hour target: ${s.overTarget}`,
    '',
    consoleUrl
      ? `Open the moderation console: ${consoleUrl}`
      : 'Open the moderation console to review.',
    '',
    'This message contains no member content on purpose. Follow the urgent-item procedure in the moderation runbook.',
    'If you cannot act within the target, switch Community to Read only from the console.',
  ];
  return { subject, text: lines.join('\n') };
}

export interface AlertConfig {
  /** Master switch. Anything other than "1" keeps alerts off. */
  enabled: string | undefined;
  /** Comma-separated recipient addresses (primary moderator and backup). */
  recipients: string | undefined;
  /** From address on a domain the owner has verified with the approved provider. */
  from: string | undefined;
  /** HTTPS endpoint of the approved provider's send API, and its key. Both come from secrets/configuration, never from code. */
  apiUrl: string | undefined;
  apiKey: string | undefined;
  consoleUrl?: string | undefined;
}

export interface Alerter {
  readonly enabled: boolean;
  /** Why it is off, for the status of the scheduled job. Never includes a secret. */
  readonly reason: string;
  notify(kind: AlertKind, summary: UrgentSummary): Promise<boolean>;
}

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** A sender for a provider that accepts `POST { from, to, subject, text }` with a bearer key (the common shape). Used only once configured. */
export function createHttpEmailSender(cfg: {
  apiUrl: string;
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailSender {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async send(mail) {
      const res = await f(cfg.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          from: cfg.from,
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
        }),
      });
      if (!res.ok) throw new Error('email_failed');
    },
  };
}

export function createAlerter(cfg: AlertConfig, sender?: EmailSender): Alerter {
  const off = (reason: string): Alerter => ({ enabled: false, reason, notify: async () => false });
  if (cfg.enabled !== '1') return off('alerts are switched off');
  const to = (cfg.recipients ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (to.length === 0 || !to.every((x) => EMAIL.test(x)))
    return off('no valid recipients are configured');
  let s = sender;
  if (!s) {
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.from || !EMAIL.test(cfg.from))
      return off('no approved email provider is configured');
    // https only; plain http is allowed solely for a provider stand-in on this machine (local testing).
    if (
      !/^https:\/\//.test(cfg.apiUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(cfg.apiUrl)
    )
      return off('the provider address must use https');
    s = createHttpEmailSender({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey, from: cfg.from });
  }
  const send = s;
  return {
    enabled: true,
    reason: 'on',
    async notify(kind, summary) {
      try {
        await send.send({ to, ...buildAlert(kind, summary, cfg.consoleUrl ?? null) });
        return true;
      } catch {
        return false; // never raise into the caller
      }
    },
  };
}
