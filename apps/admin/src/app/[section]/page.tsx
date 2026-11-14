import { notFound } from 'next/navigation';
import { SECTIONS, findSection } from '@/sections';

export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s.slug }));
}
export const dynamicParams = false;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const section = findSection((await params).section);
  if (!section) notFound();
  return (
    <>
      <h1>{section.title}</h1>
      <p>{section.purpose}</p>
      <p>
        Required permission: <code>{section.permission}</code> (always with a verified second
        factor).
      </p>
      <p>Planned: {section.plannedPhase}</p>
      <h2>Rules for the future implementation</h2>
      <ul>
        {section.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p>Nothing here is connected to data. There is nothing to show yet.</p>
    </>
  );
}
