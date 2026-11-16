import type { ModerationApi } from './api';
import type { Backlog, QueueItem } from './model';

/** Made-up items for trying the console with no server. Nothing here is real: every name and sentence is invented. */
export function demoQueue(): QueueItem[] {
  return [
    {
      id: 'demo-1',
      targetType: 'post',
      author: 'demo_member_a',
      body: 'I feel like I do not want to carry on',
      status: 'hidden',
      flags: ['self_harm'],
      reasons: ['self_harm'],
      reportCount: 1,
      urgent: true,
      ageHours: 5,
      createdAt: '2026-12-01T08:00:00Z',
      media: [],
    },
    {
      id: 'demo-2',
      targetType: 'post',
      author: 'demo_member_b',
      body: 'My first dance class journey',
      status: 'held',
      flags: ['media_review'],
      reasons: [],
      reportCount: 0,
      urgent: false,
      ageHours: 20,
      createdAt: '2026-12-01T01:00:00Z',
      media: [],
    },
    {
      id: 'demo-3',
      targetType: 'comment',
      author: 'demo_member_c',
      body: 'You should try this cleanse, I lost 9 kg',
      status: 'hidden',
      flags: [],
      reasons: ['unsafe_advice', 'spam'],
      reportCount: 3,
      urgent: false,
      ageHours: 60,
      createdAt: '2026-11-28T10:00:00Z',
      media: [],
    },
  ];
}
export function createDemoModerationApi(): ModerationApi {
  let items = demoQueue();
  const backlog = (): Backlog => ({
    open: items.length,
    urgent: items.filter((i) => i.urgent).length,
    media: items.filter((i) => i.media.length).length,
    oldestHours: Math.max(0, ...items.map((i) => i.ageHours)),
    oldestUrgentHours: Math.max(0, ...items.filter((i) => i.urgent).map((i) => i.ageHours)),
    urgentOverTarget: items.filter((i) => i.urgent && i.ageHours > 4).length,
    overTarget: items.filter((i) => !i.urgent && i.ageHours > 48).length,
    urgentTargetHours: 4,
    targetHours: 48,
  });
  return {
    kind: 'demo',
    async queue() {
      return items;
    },
    async backlog() {
      return backlog();
    },
    async act(i) {
      items = items.filter((x) => x.id !== i.targetId);
    },
    async restrict() {},
  };
}
