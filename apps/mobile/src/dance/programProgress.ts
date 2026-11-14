export interface ProgramSessionLike {
  programId: string | null;
  status: 'planned' | 'completed' | 'skipped';
  plannedFor: string | null;
}
export interface ProgramProgress {
  total: number;
  completed: number;
  skipped: number;
  upcoming: number;
  /** Planned sessions dated before today. They stay available; nothing expires. */
  earlier: number;
  finished: boolean;
  started: boolean;
}

/** Where someone is in a program, from their recorded sessions. Skipping is allowed and never counts against them. */
export function programProgress(
  programId: string,
  total: number,
  sessions: readonly ProgramSessionLike[],
  todayKey: string,
): ProgramProgress {
  const mine = sessions.filter((s) => s.programId === programId);
  const completed = Math.min(total, mine.filter((s) => s.status === 'completed').length);
  const planned = mine.filter((s) => s.status === 'planned');
  return {
    total,
    completed,
    skipped: mine.filter((s) => s.status === 'skipped').length,
    upcoming: planned.filter((s) => (s.plannedFor ?? '') >= todayKey).length,
    earlier: planned.filter((s) => (s.plannedFor ?? '') < todayKey).length,
    finished: total > 0 && completed >= total,
    started: mine.length > 0,
  };
}
