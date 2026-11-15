import * as LocalAuthentication from 'expo-local-authentication';
import { createBiometrics, type BiometricModule, type Biometrics } from './biometrics';

/** The real Face ID / Touch ID module, kept apart from the logic so the logic can be tested without a device. */
export const defaultBiometrics = (): Biometrics =>
  createBiometrics(LocalAuthentication as unknown as BiometricModule, {
    FINGERPRINT: LocalAuthentication.AuthenticationType.FINGERPRINT,
    FACIAL_RECOGNITION: LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  });
