/**
 * Dynamic layer over app.json. It changes NOTHING about the app's identity (name, slug, scheme, bundle identifier) or signing.
 * Its one job: the HealthKit native module, its usage text and its entitlement are added ONLY when the build is made with EXPO_PUBLIC_APPLE_HEALTH=1
 * (the staging-preview profile). Every other build, including production, is exactly app.json: no HealthKit entitlement, no Health usage text.
 */
const HEALTH_TEXT =
  'Locked In Fitness reads your workouts (type, start and length) from Apple Health when you turn on import, so they count toward your progress. It never reads calories, heart rate or location, and never writes to Health.';

module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_APPLE_HEALTH !== '1') return config;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        '@kingstinct/react-native-healthkit',
        {
          NSHealthShareUsageDescription: HEALTH_TEXT,
          NSHealthUpdateUsageDescription: false,
          background: false,
        },
      ],
    ],
  };
};
