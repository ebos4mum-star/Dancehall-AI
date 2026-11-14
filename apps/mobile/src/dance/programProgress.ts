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

export type SlotStatus = 'completed' | 'skipped' | 'planned' | 'notScheduled';
export interface ProgramSlot {
  week: number;
  day: number;
  workoutId: string;
  status: SlotStatus;
}

/**
 * Pairs each scheduled slot of a program with the person's matching session by date order (enrolment creates sessions in the same order as
 * the schedule). Slots without a session are "notScheduled". Used to draw the program as a timeline.
 */
export function programSlots(
  schedule: ReadonlyArray<{ week: number; day: number; workoutId: string }>,
  sessions: readonly ProgramSessionLike[],
  programId: string,
): ProgramSlot[] {
  const slots = [...schedule].sort((a, b) => a.week - b.week || a.day - b.day);
  const mine = sessions
    .filter((s) => s.programId === programId)
    .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''));
  return slots.map((s, i) => ({
    ...s,
    status: (mine[i]?.status ?? 'notScheduled') as SlotStatus,
  }));
}
