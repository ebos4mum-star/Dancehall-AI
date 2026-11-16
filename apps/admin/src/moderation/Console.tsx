'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createLiveModerationApi, type ModerationApi } from './api';
import { createDemoModerationApi } from './demo';
import { ItemCard } from './ItemCard';
import {
  MODE_LABELS,
  RESTRICT_REASONS,
  backlogStatus,
  needsNote,
  sortQueue,
  validateRestriction,
  type Backlog,
  type Mode,
  type QueueItem,
} from './model';
import { createStaffAuth } from './staffAuth';

const btn = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #6B3FA0',
  background: '#fff',
  cursor: 'pointer',
} as const;
const COLOURS = {
  clear: '#E7F5EA',
  ok: '#EEF3FB',
  attention: '#FFF1D6',
  overdue: '#FBE3E1',
} as const;

type Cfg = { url: string; publishableKey: string } | null;

export function Console({ cfg }: { cfg: Cfg }) {
  const auth = useMemo(() => (cfg ? createStaffAuth(cfg) : null), [cfg]);
  const [api, setApi] = useState<ModerationApi | null>(null);
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [factor, setFactor] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const begin = (a: ModerationApi) => setApi(a);

  if (api)
    return (
      <Queue
        api={api}
        onSignOut={() => {
          auth?.signOut();
          setApi(null);
          setStep('start');
          setPassword('');
          setCode('');
        }}
      />
    );
  return (
    <section aria-label="Staff sign-in" style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      {!cfg ? (
        <>
          <p role="status" style={{ background: '#FFF1D6', padding: 8, borderRadius: 8 }}>
            Not connected: this console is not linked to a project, so there is no real queue and
            nobody can sign in. You can try it with made-up examples.
          </p>
          <button style={btn} onClick={() => begin(createDemoModerationApi())}>
            Try the demo (made-up examples)
          </button>
        </>
      ) : step === 'start' ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await auth!.signIn(email, password);
            if (r.step === 'second_factor') {
              setFactor(r.factorId);
              setStep('code');
              setMsg(null);
            } else
              setMsg(
                'Sign-in failed. Check your details. This console needs an account with a second factor.',
              );
          }}
          style={{ display: 'grid', gap: 8 }}
        >
          <label>
            Staff email{' '}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password{' '}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button style={btn} type="submit">
            Continue
          </button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await auth!.verifyCode(factor, code);
            if (r.step === 'ready')
              begin(
                createLiveModerationApi({
                  baseUrl: cfg.url,
                  publishableKey: cfg.publishableKey,
                  getToken: auth!.getToken,
                }),
              );
            else setMsg('That code did not work. Try the next code from your authenticator app.');
          }}
          style={{ display: 'grid', gap: 8 }}
        >
          <label>
            6-digit code from your authenticator app{' '}
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button style={btn} type="submit">
            Verify
          </button>
        </form>
      )}
      {msg ? (
        <p role="alert" style={{ color: '#B3261E' }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}

function Queue({ api, onSignOut }: { api: ModerationApi; onSignOut: () => void }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [q, b] = await Promise.all([api.queue(), api.backlog()]);
      setItems(sortQueue(q));
      setBacklog(b);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the queue.');
    }
  }, [api]);
  useEffect(() => void load(), [load]);
  const status = backlog ? backlogStatus(backlog) : null;
  return (
    <section aria-label="Moderation queue" style={{ display: 'grid', gap: 12 }}>
      {api.kind === 'demo' ? (
        <p role="status" style={{ background: '#FFF1D6', padding: 8, borderRadius: 8 }}>
          Demo: made-up examples. Nothing you do here changes any real content.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btn} onClick={() => void load()}>
          Refresh
        </button>
        <button style={btn} onClick={onSignOut}>
          Sign out
        </button>
      </div>
      {status ? (
        <p
          role="status"
          style={{ background: COLOURS[status.level], padding: 10, borderRadius: 8, margin: 0 }}
        >
          <strong>{status.headline}</strong>
          {backlog
            ? ` Open: ${backlog.open}. Urgent: ${backlog.urgent}. With photos or video: ${backlog.media}. Oldest waiting: ${Math.floor(backlog.oldestHours)} h.`
            : ''}
        </p>
      ) : null}
      {backlog ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <label>
            Community mode{' '}
            <select
              value={backlog.mode ?? 'open'}
              onChange={(e) => {
                const m = e.target.value as Mode;
                if (
                  m === 'open' ||
                  window.confirm(
                    `Switch Community to "${MODE_LABELS[m]}"? Members will see the pause immediately.`,
                  )
                )
                  void api
                    .setMode(m)
                    .then(load, (x) =>
                      setErr(x instanceof Error ? x.message : 'That did not work.'),
                    );
              }}
            >
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {backlog.effectiveMode && backlog.effectiveMode !== (backlog.mode ?? 'open') ? (
            <p role="status" style={{ margin: 0 }}>
              Photos and videos are paused automatically because review is behind. They reopen when
              the queue clears.
            </p>
          ) : null}
        </div>
      ) : null}
      {err ? (
        <p role="alert" style={{ color: '#B3261E' }}>
          {err}
        </p>
      ) : null}
      {items?.length === 0 ? <p>Nothing is waiting.</p> : null}
      {items?.map((i) => (
        <ItemCard key={i.id} item={i}>
          <Actions
            item={i}
            busy={busy}
            run={async (fn) => {
              setBusy(true);
              try {
                await fn();
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'That did not work.');
              } finally {
                setBusy(false);
              }
            }}
            api={api}
          />
        </ItemCard>
      ))}
    </section>
  );
}

function Actions({
  item,
  api,
  run,
  busy,
}: {
  item: QueueItem;
  api: ModerationApi;
  run: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<'remove' | 'restrict' | null>(null);
  const [kind, setKind] = useState<'muted' | 'suspended'>('muted');
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState<(typeof RESTRICT_REASONS)[number]>('harassment');
  const [problem, setProblem] = useState<string | null>(null);
  const act = (action: 'approve' | 'remove') =>
    run(() =>
      api.act({ type: item.targetType, targetId: item.id, action, note: note || undefined }),
    );
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label>
        Note (kept in the moderation record, never shown to members)
        <input
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn} disabled={busy} onClick={() => void act('approve')}>
          {item.status === 'published' ? 'Keep it up (dismiss reports)' : 'Approve and publish'}
        </button>
        <button
          style={btn}
          disabled={busy}
          onClick={() =>
            needsNote('remove') && note.trim().length < 3
              ? setProblem('Add a short note before removing.')
              : setConfirm('remove')
          }
        >
          Remove
        </button>
        <button style={btn} disabled={busy} onClick={() => setConfirm('restrict')}>
          Restrict @{item.author}
        </button>
      </div>
      {problem ? (
        <p role="alert" style={{ color: '#B3261E', margin: 0 }}>
          {problem}
        </p>
      ) : null}
      {confirm === 'remove' ? (
        <div
          role="alertdialog"
          aria-label="Confirm removal"
          style={{ background: '#FBE3E1', padding: 8, borderRadius: 8 }}
        >
          Remove this {item.targetType} for everyone, including its author? Its photos and videos
          are deleted.{' '}
          <button
            style={btn}
            disabled={busy}
            onClick={() => void act('remove').then(() => setConfirm(null))}
          >
            Yes, remove
          </button>{' '}
          <button style={btn} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {confirm === 'restrict' ? (
        <div
          role="group"
          aria-label="Restrict member"
          style={{ background: '#FFF1D6', padding: 8, borderRadius: 8, display: 'grid', gap: 6 }}
        >
          <label>
            Level{' '}
            <select value={kind} onChange={(e) => setKind(e.target.value as 'muted' | 'suspended')}>
              <option value="muted">Muted: cannot post, comment or upload</option>
              <option value="suspended">Suspended: cannot take any member action</option>
            </select>
          </label>
          <label>
            Hours (blank = until lifted){' '}
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </label>
          <label>
            Reason{' '}
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof RESTRICT_REASONS)[number])}
            >
              {RESTRICT_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div>
            <button
              style={btn}
              disabled={busy}
              onClick={() => {
                const input = {
                  restriction: kind,
                  hours: hours === '' ? null : Number(hours),
                  reason,
                  note,
                } as const;
                const p = validateRestriction(input);
                setProblem(p);
                if (!p)
                  void run(() => api.restrict({ username: item.author, ...input })).then(() =>
                    setConfirm(null),
                  );
              }}
            >
              Apply restriction
            </button>{' '}
            <button style={btn} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
