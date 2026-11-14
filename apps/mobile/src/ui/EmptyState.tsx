import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

/** Honest empty state: says what is missing and why. Never shows made-up content. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  /** A clear next step. Shown as a button below the message. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Card>
      <View
        style={{ gap: spacing.sm, alignItems: 'flex-start' }}
        accessible
        accessibilityLabel={`${title}. ${body}`}
      >
        <Ionicons
          name={icon}
          size={32}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <AppText variant="heading">{title}</AppText>
        <AppText muted>{body}</AppText>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </Card>
  );
}
