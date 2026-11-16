import { SECTIONS } from '@/sections';
import { Console } from '@/moderation/Console';

export const dynamic = 'force-dynamic';

export default function ModerationPage() {
  const section = SECTIONS.find((s) => s.slug === 'moderation')!;
  // The project address and the PUBLISHABLE key are public by design. No secret ever reaches this page.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return (
    <>
      <h1>{section.title}</h1>
      <p>{section.purpose}</p>
      <p>
        Required: a staff account with the <code>{section.permission}</code> permission and a
        verified second factor. Every action is recorded in the audit log. Members are shown only by
        public username.
      </p>
      <ul>
        {section.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <Console cfg={url && key ? { url, publishableKey: key } : null} />
    </>
  );
}
