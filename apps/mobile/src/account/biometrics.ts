/**
 * Face ID or Touch ID as a convenience for unlocking the app. It never replaces the PIN: a failed, cancelled or unavailable biometric falls back to the PIN pad,
 * and the device's own passcode fallback is switched off so there is exactly one fallback, ours, with its lockout.
 */
export interface BiometricModule {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  supportedAuthenticationTypesAsync(): Promise<number[]>;
  authenticateAsync(o: {
    promptMessage: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean }>;
}
export type BiometricKind = 'face' | 'touch' | 'other';
export interface BiometricInfo {
  available: boolean;
  kind: BiometricKind | null;
}

export function createBiometrics(
  mod: BiometricModule,
  types = { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
) {
  return {
    async info(): Promise<BiometricInfo> {
      try {
        if (!(await mod.hasHardwareAsync()) || !(await mod.isEnrolledAsync()))
          return { available: false, kind: null };
        const supported = await mod.supportedAuthenticationTypesAsync();
        const kind: BiometricKind = supported.includes(types.FACIAL_RECOGNITION)
          ? 'face'
          : supported.includes(types.FINGERPRINT)
            ? 'touch'
            : 'other';
        return { available: true, kind };
      } catch {
        return { available: false, kind: null };
      }
    },
    /** True only when the person was recognised. Any error, cancel or lockout is false, so the caller shows the PIN pad. */
    async prompt(message: string, cancelLabel: string): Promise<boolean> {
      try {
        const r = await mod.authenticateAsync({
          promptMessage: message,
          cancelLabel,
          fallbackLabel: '',
          disableDeviceFallback: true,
        });
        return r.success === true;
      } catch {
        return false;
      }
    },
  };
}
export type Biometrics = ReturnType<typeof createBiometrics>;
