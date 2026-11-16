import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { WorldBanner, type Banner } from '@/scene/WorldBanner';
import { DevBanner } from './DevBanner';
import { FormFocusProvider, type InputRef } from './formFocus';

/** Space kept between a focused field and the edge of the visible area (above the keyboard). */
const FIELD_MARGIN = 24;

/**
 * Standard screen: scrollable, keyboard-aware, safe-area padded. `title` is omitted on screens that show a navigation header.
 * It is also the unit of a form: fields inside it move focus Next/Done in order, a focused field is scrolled clear of the keyboard, and dragging the page
 * closes the keyboard (interactively on iOS, so it follows the finger).
 */
export function Screen({
  title,
  children,
  top = true,
  banner,
}: {
  title?: string;
  children: ReactNode;
  top?: boolean;
  /** Shows this screen's world (scene, Pulse, one line of purpose) above the content. */
  banner?: Banner;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
  // Scroll a focused field into the visible part of the page (the page area already shrinks above the keyboard through KeyboardAvoidingView).
  const reveal = useCallback((input: RefObject<InputRef | null>) => {
    const sv = scroll.current;
    const el = input.current;
    if (!sv || !el) return;
    setTimeout(() => {
      el.measureInWindow((_x, y, _w, h) => {
        (
          sv as unknown as {
            measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          }
        ).measureInWindow((_sx, sy, _sw, sh) => {
          const bottom = (sh || Dimensions.get('window').height) + sy;
          let delta = 0;
          if (y + h > bottom - FIELD_MARGIN) delta = y + h - (bottom - FIELD_MARGIN);
          else if (y < sy + FIELD_MARGIN) delta = y - (sy + FIELD_MARGIN);
          if (delta !== 0) sv.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
        });
      });
    }, 120);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top ? insets.top : 0 }}>
      <DevBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{
            padding: spacing.md,
            gap: spacing.md,
            paddingBottom: spacing.xxl,
          }}
        >
          <FormFocusProvider onFieldFocus={reveal}>
            {banner ? <WorldBanner {...banner} /> : null}
            {title ? (
              <AppText variant="title" accessibilityRole="header">
                {title}
              </AppText>
            ) : null}
            {children}
          </FormFocusProvider>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
