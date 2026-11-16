import { useApp } from '@/data/AppProvider';

/** Community is offered only when the build allows it AND the data store has a Community backend. */
export function useCommunityAvailable(): boolean {
  const { config, store } = useApp();
  return config.community && typeof store.communityFeed === 'function';
}
