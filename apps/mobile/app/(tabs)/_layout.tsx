import { Redirect, Tabs } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { Ionicons } from '@expo/vector-icons';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const TABS: Array<{ name: string; label: StringKey; icon: IconName }> = [
  { name: 'index', label: 'tabs.today', icon: 'sunny-outline' },
  { name: 'dance', label: 'tabs.dance', icon: 'musical-notes-outline' },
  { name: 'food', label: 'tabs.food', icon: 'restaurant-outline' },
  { name: 'coach', label: 'tabs.coach', icon: 'chatbubble-ellipses-outline' },
  { name: 'me', label: 'tabs.me', icon: 'person-circle-outline' },
];

export default function TabLayout() {
  const { colors } = useTheme();
  const { ready, session, profile } = useApp();
  if (ready && (!session || !profile?.onboardedAt)) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarAccessibilityLabel: t(tab.label),
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={tab.icon}
                size={size}
                color={typeof color === 'string' ? color : colors.primary}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
