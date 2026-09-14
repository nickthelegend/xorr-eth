/**
 * Messages as a drawer that slides up from the bottom, over whatever is on screen.
 *
 * Talking to the agents is not somewhere you go, it is something you do *while* looking at something else:
 * you are on a chart, you want to ask about it, and closing the conversation should put you back on that
 * chart. So Messages is never a page with the tab bar under it. It rises from the bottom edge over the
 * screen and the bar, dims what it covers, and goes back down when you drag its handle, tap the dimmed
 * screen above it, press close — or Escape on the web, or back on Android, which step out of a conversation
 * to the list first.
 *
 * It holds the list of conversations (`Messages`) and one agent's conversation (`Chat`), switched in place, as a
 * messenger switches between its chat list and a chat. Mounted once at the root (`app/_layout.tsx`) and opened through
 * `useChatDrawer`, so every way in — the tab bar's Messages button, a push, the briefing's link to `/bot` — raises the
 * same drawer over the same thread.
 *
 * Tall rather than half-height: the composer needs the keyboard and the thread needs the height, and a
 * half sheet that grows to full on focus is two layouts to get right for no gain. It stops just short of
 * the status bar, so the screen it covers still shows above it — which is what makes it a drawer over
 * your screen rather than a new one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, space, timing, useReducedMotion } from '@/ui';
import { Chat } from './Chat';
import { Messages } from './Messages';
import { agentByName } from './agents';
import { useChatDrawer } from './chatDrawer';
import { chat } from './theme';
import { useProposalSeed } from './useProposalSeed';

/** Drag past this — or flick faster than the velocity below — and letting go dismisses. */
const DISMISS_AFTER = 110;
const DISMISS_VELOCITY = 700;
const HANDLE_W = 44;
const HANDLE_H = 5;
/** How far a downward drag must beat a horizontal one before the drawer starts following it. */
const DRAG_SLOP = 10;
/** How much of the screen behind stays visible above the drawer, under the status bar. */
const PEEK = space.s10;
const RADIUS = 28;
/** How dark the screen behind goes with the drawer all the way up. */
const SCRIM = 0.45;

/** Keyboard events, without assuming the DOM's types exist in a React Native build. */
type KeyTarget = {
  addEventListener?: (type: 'keydown', listener: (event: { key?: string }) => void) => void;
  removeEventListener?: (type: 'keydown', listener: (event: { key?: string }) => void) => void;
};

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
   * browser resize: the drawer keeps animating to the height the app started at, so on a rotated phone
   * it stops short and leaves a band of chat on screen.
   */
  const { height } = useWindowDimensions();
  // Below the status bar, and never flush with the top edge even where there is no inset (a browser), so
  // the screen being covered always shows above the drawer.
  const top = Math.max(insets.top, space.s20) + PEEK;
  /** The drawer's own height — how far it moves to be entirely below the screen. */
  const travel = Math.max(0, height - top);

  /**
   * How far below its open position the drawer sits. One value, two writers.
   *
   * Two writers is the whole nature of a drawer — a prop opens and closes it, a finger drags it — and
   * they must agree on one number or a drag released mid-transition fights the transition it landed in.
   * `useAnimatedReaction` rather than `useEffect` is what makes that safe: both writers then run on the UI
   * thread, so when a flick dismisses the drawer the slide continues in the same frame instead of waiting
   * a round trip through React to be told it is closing.
   */
  const y = useSharedValue(travel);

  /*
   * Mount lags `open` on the way out, or the drawer would vanish instead of sliding away: returning null
   * the instant `open` goes false unmounts the thing that is meant to be animating.
   */
  const [mounted, setMounted] = useState(open);
  // Adjusted during render rather than from an effect. Opening from an effect costs a frame with the
  // drawer mounted at its closed position.
  if (open && !mounted) setMounted(true);

  /*
   * Built here, on the JS thread, and captured by the worklets below.
   *
   * `timing()` lives in `src/ui/motion.ts` and is not a worklet, so calling it from inside the reaction or
   * the gesture throws "Tried to synchronously call a Remote Function" the first time the drawer moves. A
   * worklet may only close over plain values, and a timing config is one.
   */
  const slideCfg = useMemo(() => timing(duration.slow, reduced), [reduced]);
  const snapCfg = useMemo(() => timing(duration.fast, reduced), [reduced]);

  const target = useDerivedValue(() => (open && mounted ? 0 : travel), [open, mounted, travel]);

  useAnimatedReaction(
    () => target.value,
    (to, from) => {
      if (to === from) return;
      y.value = withTiming(to, slideCfg, (finished) => {
        if (finished && to === travel) runOnJS(setMounted)(false);
      });
    },
    [slideCfg, travel],
  );

  const close = useCallback(() => onClose(), [onClose]);
  const agent = useChatDrawer((s) => s.agent);
  const showList = useChatDrawer((s) => s.showList);
  /** Back steps out of a conversation to the list before it lowers the drawer. */
  const back = useCallback(() => {
    if (agent) showList();
    else close();
  }, [agent, showList, close]);

  /* Android's back button steps back inside the drawer before it pops the route underneath it. */
  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [open, back]);

  /* Escape does the same on the web, where there is a keyboard and no back button. */
  useEffect(() => {
    const target = globalThis as KeyTarget;
    if (!open || Platform.OS !== 'web' || !target.addEventListener) return;
    const onKey = (event: { key?: string }) => {
      if (event.key === 'Escape') back();
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener?.('keydown', onKey);
  }, [open, back]);

  /*
   * Drag the handle down to dismiss.
   *
   * The gesture is on the handle alone rather than the whole drawer: a pan that owns the thread fights the
   * ScrollView for every touch, and losing the ability to scroll a conversation is a far worse trade than
   * having to reach for the handle. `activeOffsetY` and `failOffsetX` keep it from firing on the small
   * vertical drift inside a horizontal swipe.
   *
   * The disable below is not a shortcut. React Compiler's immutability rule freezes any value a hook has
   * written, and it has no model for worklets: a reanimated shared value is designed to be assigned from
   * the UI thread, which is the entire reason it is a `.value` box and not state. Assignments stay inside
   * the two worklets below, and the reaction above is the only other writer.
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
        // Carry on down from where the finger let go, then tell React. The reaction re-issues the same
        // animation a frame later, which retargets to the same place and changes nothing.
        y.value = withTiming(travel, slideCfg);
        runOnJS(onClose)();
      } else {
        y.value = withTiming(0, snapCfg);
      }
    });
  /* eslint-enable react-hooks/immutability */

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  // The screen behind darkens as the drawer rises and clears as it falls, following a drag too.
  const scrim = useAnimatedStyle(() => ({
    opacity: travel > 0 ? interpolate(y.value, [0, travel], [SCRIM, 0], Extrapolation.CLAMP) : 0,
  }));

  /*
   * Unmounted while closed, so the thread's effects — the proposal fetch and the expiry interval — do not
   * run behind screens that never show them.
   */
  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }, scrim]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close messages"
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            bottom: 0,
            // The room's own ground, so the handle zone above the list is part of it.
            backgroundColor: chat.groundTop,
            borderTopLeftRadius: RADIUS,
            borderTopRightRadius: RADIUS,
            overflow: 'hidden',
          },
          slide,
        ]}
      >
        <GestureDetector gesture={drag}>
          {/* The grab zone, not the bar itself — 5pt is a mark, not a target. */}
          <View style={{ paddingTop: space.s10, paddingBottom: space.s10 }}>
            <View
              style={{
                alignSelf: 'center',
                width: HANDLE_W,
                height: HANDLE_H,
                borderRadius: HANDLE_H,
                backgroundColor: chat.handle,
              }}
            />
          </View>
        </GestureDetector>

        <DrawerContent onClose={close} footerInset={Math.max(insets.bottom, space.s14)} />
      </Animated.View>
    </View>
  );
}

/** The list, or one agent's conversation — and, whichever is showing, what the agents have to say as the drawer opens. */
function DrawerContent({ onClose, footerInset }: { onClose: () => void; footerInset: number }) {
  useProposalSeed();
  const agentName = useChatDrawer((s) => s.agent);
  const openConversation = useChatDrawer((s) => s.openConversation);
  const showList = useChatDrawer((s) => s.showList);

  if (agentName) {
    const agent = agentByName(agentName);
    return (
      <Chat
        key={agent.id}
        agent={agent}
        onBack={showList}
        onClose={onClose}
        onSwitchAgent={(a) => openConversation(a.name)}
        footerInset={footerInset}
      />
    );
  }
  return <Messages onClose={onClose} onOpen={openConversation} footerInset={footerInset} />;
}
