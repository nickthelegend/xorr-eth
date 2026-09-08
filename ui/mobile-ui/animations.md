# animations.md — motion

Motion here is **confirmation, not decoration.** A trading UI that animates while a number changes
makes the number untrustworthy. Every transition below is short, on a single property, and exists
to show that the app registered a tap.

## Global rules

1. **Never animate a price.** Values snap. Interpolating a number implies a market move that
   didn't happen.
2. **One property per transition.** `transform` or `width` or `background` — not `all`.
3. **Durations: 150 / 180 / 250ms.** Nothing else. Under 150 reads as a glitch; over 250 reads as
   lag on a screen the user taps repeatedly.
4. **Default easing is the platform default** (`ease`, i.e. CSS `ease` / RN `Easing.inOut(ease)`).
   No custom cubic-bezier anywhere. No bounce, no spring, no overshoot — overshoot on a
   confirmation control suggests the value is still settling.
5. **No entrance animations.** Screens and lists appear composed. Staggered list reveals delay
   the price a trader came to read.
6. **Respect reduced motion.** Every transition below degrades to an instant state change with no
   loss of meaning; the color/position change alone carries the information.

## Inventory

| Element | Property | Duration | Notes |
|---|---|---|---|
| Switch knob | `transform: translateX(0 → 19–21px)` | 180ms | Track `background` cross-fades in the same 180ms. |
| Segmented thumb | `background` | 150ms | Fastest in the app — selection must feel instant. |
| Spend-cap marker | `left` (%) | 180ms | Slides along the risk gradient as the cap steps. |
| Allocation bars | `width` (%) | 200ms | Three sleeve bars retract/extend together on a weight change. |
| Leaderboard bars | `width` (%) | 250ms | Longest, because a re-sort moves several bars at once and 250 lets the eye follow one. |
| Close-position fill | `width` (%) | 180ms | Tracks the 25/50/75/100 steps. |
| Swap amount fill | `width` (%) | 180ms | — |
| KYC progress | `width` (%) | 250ms | One step per tap, so the longer duration reads as progress. |
| Button hover | `background` | default (~150ms) | `#fff → rgba(255,255,255,.88)`; `#1B1C1E → #252629`. |
| Pressed state | `opacity → .85` | instant | Native `Pressable` feedback; not a CSS transition. |
| Skeleton block | `opacity 1 → .45`, reversing | 900ms | The one duration outside 150/180/250, and the only looping animation in the app. See below. |

## Not animated, on purpose

- **Candles.** No draw-on, no grow-from-baseline. The chart is data; it renders complete.
  Live updates mutate the last candle in place with no transition.
- **Prices, deltas, P&L, order totals, keypad amount.** Snap.
- **TP/SL markers.** They jump to the new projected price. A slide implies the *price* moved rather
  than the user's setting.
- **Screen transitions.** Use the platform default push/present. Don't author custom ones.
- **The agent status dot.** Static color, no pulse. A pulsing dot on a bottom tab is a distraction
  the user can't dismiss.

## If you add motion

Two places would genuinely benefit, both currently unbuilt:

- **Agent orb idle** — a slow 3–4s scale breathe (1.0 → 1.015) on *active* agents only. It would
  make the roster feel alive and encode state. Keep it off paused agents.
- **Order fill confirmation** — a 250ms scale-in on the filled-order chat bubble, once, on arrival.

Anything beyond those two, don't.

## The skeleton pulse

The loading blocks used to be static grey, on the reading that §5's ban on entrance animations and
staggered list reveals also ruled out a shimmer. The ban is right; that conclusion was too broad.

What §5 forbids is **content arriving with a flourish** — a fade-in, a slide, a stagger down a list
— because it dramatises data appearing and, on a price list, a movement that means nothing reads as
a movement that means something. A uniform opacity pulse on a block that is *not content* does none
of that. It is not an entrance: the block is already there, and it is replaced instantly when the
real thing lands.

It earns its place because a static grey block cannot say the one thing that matters: **still
coming**. Without it the app has two appearances for three facts — an empty row, a loading row and a
finished row where an issuer simply has no logo all look the same. That is the same "nothing" versus
"not yet" conflation this app fixes everywhere else, and the asset mark is where it bit: a Markets
list mid-load was indistinguishable from one where every logo lookup had come back empty.

Rules it still obeys:

- **One property.** Opacity, nothing else. No sweeping gradient, no translation — a highlight
  travelling across rows in sequence *is* a staggered reveal and stays banned.
- **Uniform.** Every block pulses together. No per-row offset.
- **Shallow.** Down to .45, not to zero. A skeleton must not out-contrast the content beside it.
- **Off under reduced motion**, where the block is simply grey.
- **Never on a price.** It appears only where a value is absent. The instant a real figure exists,
  the block is gone — the price rule is untouched.

900ms because the interaction scale does not apply. 150/180/250 is calibrated for a transition the
user *caused*; nobody pressed a skeleton. At 250 it strobes. At 900 it breathes.
