import { SECTIONS } from '@/sections';
import { EXAMPLE_LICENCE, exampleTerritoryTable } from '@/readiness';

export const dynamic = 'force-static';

export default function LicensingPage() {
  const section = SECTIONS.find((s) => s.slug === 'licensing')!;
  return (
    <>
      <h1>{section.title}</h1>
      <p>{section.purpose}</p>
      <p>
        Required permission: <code>{section.permission}</code> (always with a verified second
        factor). No licence records are connected: there is nothing licensed yet, and no music,
        video or instructor likeness is used anywhere in the app.
      </p>
      <h2>How territorial clearance works</h2>
      <ul>
        {section.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
        <li>
          A licence must reference a signed agreement before it can be cleared, and clearing records
          who did it and when.
        </li>
        <li>
          Media is offered only if every asset attached to a workout (video, music, likeness) is
          cleared for the person&apos;s country on that day.
        </li>
        <li>Expired or revoked licences remove the workout from the catalog automatically.</li>
      </ul>
      <h2>Worked example (illustrative, not a real record)</h2>
      <p>
        {EXAMPLE_LICENCE.title}: territories {EXAMPLE_LICENCE.territories.join(', ')},{' '}
        {EXAMPLE_LICENCE.startsOn} to {EXAMPLE_LICENCE.endsOn}.
      </p>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Country</th>
            <th align="left">On</th>
            <th align="left">Media allowed?</th>
          </tr>
        </thead>
        <tbody>
          {exampleTerritoryTable().map((r) => (
            <tr key={`${r.country}-${r.today}`}>
              <td>{r.country}</td>
              <td>{r.today}</td>
              <td>{r.allowed ? '✓ yes' : '✗ no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
