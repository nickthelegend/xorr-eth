/**
 * haptics.ts — the whole vocabulary, used sparingly (FEATURES.md #23).
 *
 * A phone that buzzes on every tap stops meaning anything by the second screen, so this file is short on purpose and
 * every beat in it is for an event the person would want to know about without looking. They are listed here rather
 * than chosen at each call site, because a vocabulary invented twice is two vocabularies.
 *
 * ## The map
 *
 * | Beat | When | What it feels like |
 * |---|---|---|
 * | `selectionTick` | a switch flips, a segment or a filter is chosen, a chart is scrubbed | a tick |
 * | `fillTap` | an order filled, money landed | one crisp confirm |
 * | `rejectTap` | the executor refused, a trade was blocked or failed | one blunt refusal |
 * | `grantTap` | a permission was granted or re-granted on-chain | one firm press — a lever set |
 * | `heavyTap` | the finger's moment: a held stop reaching 600ms | weight |
 * | `killTap` | the chain confirms the stop | a thud and a latch — the only two beats in the app |
 *
 * Three things make them tell apart in a pocket. **Family**: a fill and a refusal are notifications, which the OS gives
 * its own rhythm; a grant and a stop are impacts, which are single blows of different weight. **Weight**: a grant is
 * `Medium` and the stop's own moment is `Heavy`, so the more consequential act is the heavier one. **Count**: exactly
 * one event in this app is two beats, and it is the one after which nothing can trade.
 *
 * The pairs that matter are the ones that mean opposite things and could otherwise be confused:
 *
 *   fill  ↔ reject   a trade happened, or it did not — different notification patterns, never the same beat twice
 *   grant ↔ kill     the bot was given the permission, or it was taken away — a single press against a double thud
 *
 * A beat is never the only report. Every one of these accompanies words on screen that say the same thing, because a
 * phone can be silenced, held by someone who cannot feel it, or in a browser — where none of this fires at all.
 *
 * The phone only. `expo-haptics` does nothing useful in a browser, and a web page that vibrates is the opposite of
 * quiet. A failure is ignored on purpose: a device with no haptic engine is not a reason for a control to stop working.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const ON_PHONE = Platform.OS === 'ios' || Platform.OS === 'android';

/** A selection changed. */
export function selectionTick(): void {
  if (ON_PHONE) void Haptics.selectionAsync().catch(() => undefined);
}

/**
 * Something the user asked for happened: an order filled, a deposit landed.
 *
 * A fill and an arrival are the same event to the hand — money moved, the way you asked — so they are the same beat.
 */
export function fillTap(): void {
  if (ON_PHONE) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/**
 * The name `fillTap` had when the only thing that used it was a deposit landing.
 *
 * Kept because `app/deposit.tsx` calls it; it is the same beat, and there is no second success pattern.
 */
export const successTap = fillTap;

/**
 * Something the user asked for was refused: the executor declined it, a trade was blocked, an order failed.
 *
 * Deliberately the warning pattern rather than the error one. The app has one three-beat-feeling event and it is the
 * stop; a refused order is a "no", not an alarm, and it is always accompanied by the sentence saying why.
 */
export function rejectTap(): void {
  if (ON_PHONE) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

/**
 * A permission granted, or re-granted, and confirmed on-chain.
 *
 * An impact rather than a notification, because it is not news the app is delivering — it is a lever the person just
 * set. `Medium`: firmer than a selection, lighter than the stop, which is the relation the two acts have.
 */
export function grantTap(): void {
  if (ON_PHONE) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** The one heavy moment: pulling the stop, as a hold on `HoldButton` completes. */
export function heavyTap(): void {
  if (ON_PHONE) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

/** How long after the thud the latch lands. Short enough to be one event, long enough to be two beats. */
const LATCH_MS = 90;

/**
 * The stop, confirmed on-chain — the only two-beat haptic in the app.
 *
 * A thud and a latch: `Heavy`, then `Rigid` a beat later. `heavyTap` is the finger's moment, when the hold completes
 * and the signature goes out; this is the chain's answer, and the two must not feel the same or the second says
 * nothing. Every other confirmation in the app is a single tap, so a phone in a pocket can tell this one apart from a
 * fill without being looked at.
 *
 * The beat is a real interval and not an animation: nothing on screen is waiting for it.
 */
export function killTap(): void {
  if (!ON_PHONE) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined);
  }, LATCH_MS);
}
