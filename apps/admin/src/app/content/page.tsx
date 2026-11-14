import { SECTIONS } from '@/sections';
import { sampleReadiness } from '@/readiness';

export const dynamic = 'force-static';

export default function ContentPage() {
  const section = SECTIONS.find((s) => s.slug === 'content')!;
  const rows = sampleReadiness();
  return (
    <>
      <h1>{section.title}</h1>
      <p>{section.purpose}</p>
      <p>
        Required permission: <code>{section.permission}</code> to edit, <code>content.publish</code>{' '}
        to publish (always with a verified second factor).
      </p>
      <h2>Publication readiness (sample workouts)</h2>
      <p>
        These are the sample text outlines used in development builds. None is connected to a
        database, review or licence yet, so each shows what it still needs before it could be
        offered publicly. A workout can be published only when every check passes.
      </p>
      <ul>
        {section.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th align="left">Workout</th>
            <th align="left">Real content</th>
            <th align="left">Independent review</th>
            <th align="left">Licences</th>
            <th align="left">Structure</th>
            <th align="left">Safety notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title} ({r.minutes} min)
              </td>
              {r.check.items.map((i) => (
                <td key={i.id}>{i.passed ? '✓ yes' : '✗ not yet'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>Nothing here is connected to data.</p>
    </>
  );
}
