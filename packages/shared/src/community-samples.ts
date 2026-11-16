import { emptyCommunity, type CommunityState } from './community-engine';

/**
 * SYNTHETIC members and posts for development, so an empty local feed is not mistaken for a broken one. Every one is labelled as a sample in the app, they are not real
 * people, and they are never created in a production build.
 */
export function sampleCommunity(nowIso: string): CommunityState {
  const s = emptyCommunity();
  const at = (minAgo: number) => new Date(Date.parse(nowIso) - minAgo * 60_000).toISOString();
  const members: Array<[string, string]> = [
    ['sample-member-1', 'sample_ama'],
    ['sample-member-2', 'sample_kofi'],
    ['sample-member-3', 'sample_efua'],
    ['sample-member-4', 'sample_yaw'],
  ];
  for (const [id, username] of members) s.profiles[id] = { username, createdAt: at(60 * 24 * 30) };
  const post = (
    n: number,
    by: number,
    type: 'text' | 'story' | 'milestone',
    body: string,
    minAgo: number,
    milestone: {
      kind: 'workout' | 'achievement';
      title: string;
      style?: string | null;
    } | null = null,
  ) =>
    s.posts.push({
      id: `sample-post-${n}`,
      authorId: members[by]![0],
      authorUsername: members[by]![1],
      type,
      body,
      milestone: milestone
        ? {
            kind: milestone.kind,
            title: milestone.title,
            style: milestone.style ?? null,
            minutes: null,
            achievementId: null,
          }
        : null,
      media: [],
      status: 'published',
      createdAt: at(minAgo),
      isSample: true,
      flags: [],
    });
  post(1, 0, 'milestone', 'Finished a workout: Dancehall basics\nFelt good to move today.', 20, {
    kind: 'workout',
    title: 'Dancehall basics',
    style: 'dancehall',
  });
  post(2, 1, 'text', 'Short on time, so I did ten minutes in the kitchen. It still counts!', 95);
  post(
    3,
    2,
    'story',
    'I used to think exercise had to be hard and serious. Dancing to music I grew up with changed that for me. Some days it is five minutes, some days it is an hour, and I stopped keeping score. If you are just starting, pick one song you love and move to it.',
    180,
  );
  post(4, 3, 'milestone', 'Earned: First week\nSmall steps add up.', 400, {
    kind: 'achievement',
    title: 'First week',
  });
  s.comments.push(
    {
      id: 'sample-comment-1',
      postId: 'sample-post-1',
      authorId: members[1]![0],
      authorUsername: members[1]![1],
      body: 'Well done!',
      status: 'published',
      createdAt: at(15),
      isSample: true,
    },
    {
      id: 'sample-comment-2',
      postId: 'sample-post-3',
      authorId: members[0]![0],
      authorUsername: members[0]![1],
      body: 'Thank you for sharing this. One song is a great idea.',
      status: 'published',
      createdAt: at(150),
      isSample: true,
    },
  );
  s.reactions.push(
    { postId: 'sample-post-1', userId: members[2]![0] },
    { postId: 'sample-post-3', userId: members[0]![0] },
    { postId: 'sample-post-3', userId: members[1]![0] },
  );
  return s;
}
