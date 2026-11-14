import { SECTIONS } from '@/sections';

export default function Overview() {
  return (
    <>
      <h1>Admin overview</h1>
      <p>
        Prepared areas. None are connected to data yet; each lists the permission and rules it will
        enforce.
      </p>
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.slug}>
            <strong>{s.title}</strong>: {s.purpose} ({s.plannedPhase})
          </li>
        ))}
      </ul>
    </>
  );
}
