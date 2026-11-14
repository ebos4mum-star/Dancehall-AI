import { describe, expect, it, vi } from 'vitest';
import { bindAuthLifecycle, type AppStateSource } from './authLifecycle';

function fake(initial: string) {
  let listener: ((s: string) => void) | null = null;
  const remove = vi.fn();
  const app: AppStateSource = {
    currentState: initial,
    addEventListener: (_t, l) => {
      listener = l;
      return { remove };
    },
  };
  const auth = { startAutoRefresh: vi.fn(async () => {}), stopAutoRefresh: vi.fn(async () => {}) };
  return { app, auth, emit: (s: string) => listener!(s), remove };
}

describe('auth lifecycle', () => {
  it('starts refreshing when the app is already active at launch', () => {
    const f = fake('active');
    bindAuthLifecycle(f.auth, f.app);
    expect(f.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(f.auth.stopAutoRefresh).not.toHaveBeenCalled();
  });
  it('does not refresh when launched in the background', () => {
    const f = fake('background');
    bindAuthLifecycle(f.auth, f.app);
    expect(f.auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(f.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
  it('treats a not-yet-known state as active (the supabase-js default); a later change corrects it', () => {
    const f = fake('active');
    (f.app as { currentState: unknown }).currentState = null;
    bindAuthLifecycle(f.auth, f.app);
    expect(f.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    f.emit('background');
    expect(f.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
  it('stops in the background / inactive state and starts again when active', () => {
    const f = fake('active');
    bindAuthLifecycle(f.auth, f.app);
    f.emit('background');
    expect(f.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    f.emit('inactive');
    expect(f.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
    f.emit('active');
    expect(f.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });
  it('unbinding removes the listener and stops refreshing', () => {
    const f = fake('active');
    const off = bindAuthLifecycle(f.auth, f.app);
    off();
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
  it('a failing start/stop is swallowed (no unhandled rejection, no sign-out path)', async () => {
    const f = fake('active');
    f.auth.startAutoRefresh.mockRejectedValue(new Error('boom'));
    f.auth.stopAutoRefresh.mockImplementation(() => {
      throw new Error('sync boom');
    });
    expect(() => bindAuthLifecycle(f.auth, f.app)).not.toThrow();
  });
});
