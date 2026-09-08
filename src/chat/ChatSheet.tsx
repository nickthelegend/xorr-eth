/**
 * The chat, as a sheet that comes up from the button in the middle of the tab bar.
 *
 * Agents used to be a tab — a destination alongside Markets and Assets. But talking to the bot is
 * not somewhere you go, it is something you do *while* looking at something else: you are on a
 * chart, you want to ask about it, and closing the conversation should put you back on that chart
 * rather than wherever the tab bar last left you. A sheet does that; a tab cannot.
 *
 * It renders the same `<Chat />` the `/bot` route does, over the same `useThread` store, so the two
 * are one conversation — ask something here and it is there, and the push notification still has a
 * route to land on.
 *
 * Full-screen rather than a half sheet: the composer needs the keyboard, the thread needs the
 * height, and a half sheet that grows to full on focus is two layouts to get right for no gain.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, duration, radius, space, timing, useReducedMotion } from '@/ui';
import { Chat } from './Chat';

/** Drag past this — or flick faster than the velocity below — and letting go dismisses. */
const DISMISS_AFTER = 110;
const DISMISS_VELOCITY = 700;
const HANDLE_W = 44;
const HANDLE_H = 5;
/** How far a downward drag must beat a horizontal one before the sheet starts following it. */
const DRAG_SLOP = 10;

export interface ChatSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ChatSheet({ open, onClose }: ChatSheetProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  /*
   * The travel distance is read per render, not captured once at module load.
   *
   * `Dimensions.get()` at import time is the classic RN bug that survives every rotation and every
   * browser resize: the sheet keeps animating to the height the app started at, so on a rotated
   * phone it stops short and leaves a band of chat on screen.
   */
  const { height } = useWindowDimensions();

  /**
   * How far below its open position the sheet sits. One value, two writers.
   *
   * Two writers is the whole nature of a sheet — a prop opens and closes it, a finger drags it —
   * and they must agree on one number or a drag released mid-transition fights the transition it
   * landed in. `useAnimatedReaction` rather than `useEffect` is what makes that safe: both writers
   * then run on the UI thread, so when a flick dismisses the sheet the slide continues in the same
   * frame instead of waiting a round trip through React to be told it is closing.
   */
  const y = useSharedValue(height);

  /*
   * Mount lags `open` on the way out, or the sheet would vanish instead of sliding away: returning
   * null the instant `open` goes false unmounts the thing that is meant to be animating.
   */
  const [mounted, setMounted] = useState(open);
  // Adjusted during render rather than from an effect. Opening from an effect costs a frame with
  // the sheet mounted at its closed position, which is a black rectangle over the screen for one
  // paint; the same fix as `auto-close/[id].tsx`, which seeded its trail the same wrong way.
  if (open && !mounted) setMounted(true);

  /*
   * Built here, on the JS thread, and captured by the worklets below.
   *
   * `timing()` lives in `src/ui/motion.ts` and is not a worklet, so calling it from inside the
   * reaction or the gesture throws "Tried to synchronously call a Remote Function" the first time
   * the sheet moves — which is exactly what it did. A worklet may only close over plain values, and
   * a timing config is one.
   */
  const slideCfg = useMemo(() => timing(duration.base, reduced), [reduced]);
  const snapCfg = useMemo(() => timing(duration.fast, reduced), [reduced]);

  const target = useDerivedValue(() => (open && mounted ? 0 : height), [open, mounted, height]);

  useAnimatedReaction(
    () => target.value,
    (to, from) => {
      if (to === from) return;
      y.value = withTiming(to, slideCfg, (finished) => {
        if (finished && to === height) runOnJS(setMounted)(false);
      });
    },
    [slideCfg, height],
  );

  const close = useCallback(() => onClose(), [onClose]);

  /* Android's back button closes the sheet before it pops the route underneath it. */
  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  /*
   * Drag the handle down to dismiss.
   *
   * The gesture is on the handle alone rather than the whole sheet: a pan that owns the thread
   * fights the ScrollView for every touch, and losing the ability to scroll a conversation is a far
   * worse trade than having to reach for the handle. `activeOffsetY` and `failOffsetX` keep it from
   * firing on the small vertical drift inside a horizontal swipe.
   *
   * The disable below is not a shortcut. React Compiler's immutability rule freezes any value a
   * hook has written, and it has no model for worklets: a reanimated shared value is designed to be
   * assigned from the UI thread, which is the entire reason it is a `.value` box and not state. The
   * rule is right about React state and wrong about this. Assignments stay inside the two worklets
   * below, and the reaction above is the only other writer.
   */
  /* eslint-disable react-hooks/immutability -- shared values are UI-thread mutable by design */
  const drag = Gesture.Pan()
    .activeOffsetY(DRAG_SLOP)
    .failOffsetX([-DRAG_SLOP, DRAG_SLOP])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_AFTER || e.velocityY > DISMISS_VELOCITY) {
        // Carry on down from where the finger let go, then tell React. The reaction re-issues the
        // same animation a frame later, which retargets to the same place and changes nothing.
        y.value = withTiming(height, slideCfg);
        runOnJS(onClose)();
      } else {
        y.value = withTiming(0, snapCfg);
      }
    });
  /* eslint-enable react-hooks/immutability */

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  /*
   * Unmounted while closed, so the thread's effects — the proposal fetch and the expiry interval —
   * do not run behind four tabs that never show them.
   */
  if (!mounted) return null;

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          overflow: 'hidden',
        },
        slide,
      ]}
    >
      <GestureDetector gesture={drag}>
        {/* The grab zone, not the hairline itself — 5pt is a mark, not a target. */}
        <View style={{ paddingTop: insets.top + space.s10, paddingBottom: space.s14 }}>
          <View
            style={{
              alignSelf: 'center',
              width: HANDLE_W,
              height: HANDLE_H,
              borderRadius: HANDLE_H,
              backgroundColor: colors.ink30,
            }}
          />
        </View>
      </GestureDetector>

      <Chat onClose={close} footerInset={Math.max(insets.bottom, space.s14)} />
    </Animated.View>
  );
}
