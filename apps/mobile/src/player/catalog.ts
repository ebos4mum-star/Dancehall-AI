import type { ComponentType } from 'react';
import type { InstructionalTrack, Licence, PresentationKind } from '@dancehall/shared';

/**
 * The instructional media catalogue. EMPTY on purpose: there is no recorded real-dancer footage, no rigged 3D animation and no cleared
 * licence yet (docs/INSTRUCTIONAL_MEDIA.md). When owner-supplied assets arrive they are added here (or loaded from the backend) with a
 * licence, a fitness review and a sequence that matches the workout; the player picks them up with no further changes.
 */
export const INSTRUCTION_TRACKS: readonly InstructionalTrack[] = [];
export const INSTRUCTION_LICENCES: readonly Licence[] = [];

export interface StageRendererProps {
  track: InstructionalTrack;
  /** Seconds into the workout, from the canonical clock. Renderers follow it; they never drive it. */
  positionS: number;
  playing: boolean;
  reducedMotion: boolean;
  onError: () => void;
}
const renderers = new Map<PresentationKind, ComponentType<StageRendererProps>>();
/** Registers the component that can play a presentation. Without one, that presentation is reported as unable to load. */
export const registerStageRenderer = (k: PresentationKind, c: ComponentType<StageRendererProps>) =>
  void renderers.set(k, c);
export const stageRendererFor = (k: PresentationKind) => renderers.get(k);
