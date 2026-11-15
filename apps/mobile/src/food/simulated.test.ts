import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { isSimulatedRecognition } from './simulated';

describe('simulated recognition is never presented as real AI', () => {
  it('is simulated unless a live AI gateway is configured', () => {
    expect(isSimulatedRecognition({})).toBe(true);
    expect(isSimulatedRecognition({ aiApiUrl: undefined })).toBe(true);
    expect(isSimulatedRecognition({ aiApiUrl: 'https://ai.example.test' })).toBe(false);
  });
  it('every place a simulated estimate is shown says so in plain words', () => {
    expect(en['food.tag.simulated']).toMatch(/Simulated.*not real AI/);
    expect(en['cam.simulatedBadge']).toMatch(/SIMULATED, NOT REAL AI/);
    expect(en['cam.mockBanner']).toMatch(/not real AI/);
    expect(en['coach.simulatedTag']).toMatch(/SIMULATED/);
    expect(en['ban.camera.line']).toMatch(/Simulated recognition/);
  });
});
