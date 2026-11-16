import type { ReactNode } from 'react';
import { ageLabel, isOverdue, playbookFor, type QueueItem } from './model';

const box = {
  border: '1px solid #E6DCEB',
  borderRadius: 12,
  padding: 12,
  background: '#fff',
  display: 'grid',
  gap: 8,
} as const;

/** One queue item. Shows the public username, the content, why it is here and the written procedure. Never an account id or email: the data does not carry them. */
export function ItemCard({ item, children }: { item: QueueItem; children?: ReactNode }) {
  const play = playbookFor(item);
  const overdue = isOverdue(item);
  return (
    <article
      style={{ ...box, borderColor: item.urgent ? '#B3261E' : '#E6DCEB' }}
      aria-label={`${item.targetType} by ${item.author}`}
    >
      <header style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong>{`@${item.author}`}</strong>
        <span>{item.targetType}</span>
        <span>{item.status}</span>
        <span
          style={{ color: overdue ? '#B3261E' : undefined }}
        >{`waiting ${ageLabel(item.ageHours)}${overdue ? ' (past target)' : ''}`}</span>
        {item.urgent ? <strong style={{ color: '#B3261E' }}>URGENT</strong> : null}
      </header>
      <p
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          background: '#F7F2FA',
          padding: 8,
          borderRadius: 8,
        }}
      >
        {item.body || '(no text)'}
      </p>
      {item.media.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {item.media.map((m) =>
            m.kind === 'photo' ? (
              <img
                key={m.uri}
                src={m.uri}
                alt={`${m.role} photo to review`}
                style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8 }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <video
                key={m.uri}
                src={m.uri}
                controls
                preload="metadata"
                style={{ maxWidth: 260, borderRadius: 8 }}
                aria-label="video to review"
              />
            ),
          )}
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 13 }}>
        {item.reportCount > 0
          ? `${item.reportCount} report${item.reportCount === 1 ? '' : 's'}: ${item.reasons.join(', ') || 'no reason given'}. `
          : ''}
        {item.flags.length ? `Flags: ${item.flags.join(', ')}.` : ''}
      </p>
      <details>
        <summary>{`Procedure: ${play.title}`}</summary>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {play.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
      {children}
    </article>
  );
}
