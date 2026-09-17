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
| Messages drawer | `transform: translateY` (below the screen ↔ open) | up 420ms ease-out · down 250ms | Rises once it has laid out, on the arrival curve; goes down on the interaction curve, and follows a drag. The scrim's opacity follows it. See below. |
| Tab bar | `transform: translateY` (0 ↔ its own height) | down 420ms ease-out · up 250ms | Moves with the Messages drawer, starting when the drawer starts. See below. |
| Kept value | `opacity` (1 → .78, reversing) | 900ms | A figure staying on screen while it is read again, instead of going back to a skeleton. See below. |
| Messages room | `opacity` (the room being left, over the one that arrived) | 250ms | A theme change dissolving instead of flashing. Both rooms are complete; one becomes transparent. See below. |
| Tab bar mark | `transform: scale` (0 ↔ 1) | 150ms | The raised pill under the open place, growing into shape on arrival and shrinking away on leaving. The glyph's colour still snaps. |
| Sparkline, `live` | `opacity` (.9 → 1 → .9, the whole glyph) | 150ms up · 250ms back | One breath when the series it was handed actually changed. The line itself still redraws instantly. See below. |
| Stop curtain | `opacity` (the blackout) · `transform: translateY` (the curtain) · `transform: scale` (the badge) | 420ms ease-out · 420ms ease-out · 250ms | The kill switch's own screen, up while the revoke is signed and confirmed. See below. |
| Agent orb, `stage` | `transform: scale` (thinking, decided, filled) · `opacity` (executing) | 3600ms breathing · 900ms breathing · 250ms settling | The agent's orb performing what the screen knows the agent is doing. Driven by a prop, never a timer. See below. |
| Balance roll-over | `transform: translateY` + `opacity`, per changed character | 180ms | A balance or P&L figure handing each changed character to the one that replaces it, in the direction the figure moved. Opt-in (`<RollingNumber roll>`), never on a market quote. See below. |

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

- ~~**Agent orb idle** — a slow 3–4s scale breathe (1.0 → 1.015) on *active* agents only.~~ Built
  2026-09-17 as `<AgentOrb stage="thinking">`; see "The agent orb's stages" above. It is off an agent that
  is not working, which is the stricter version of "keep it off paused agents".
- **Order fill confirmation** — a 250ms scale-in on the filled-order chat bubble, once, on arrival. Built
  in the chat's `Turn`, and again as `stage="filled"` on the orb.

Anything beyond those two, don't.

## The kept value

A screen coming back into view reads its numbers again (`useFreshOnReturn`), and it deliberately does
**not** go back to a skeleton. The question has not changed, so what is on screen is still true, and
replacing a real balance with a grey block in order to fetch the same balance again is the app throwing
away a correct answer to look busy.

That was already right, and it made the refresh completely silent: a figure read thirty seconds ago and
a figure being replaced this instant were drawn identically. That is the "nothing" versus "not yet"
conflation this app fixes everywhere else, one step along — **"still" versus "still arriving"**.

`<Refreshing on>` says the missing half. The value stays, exactly as it was, and breathes on the
skeleton's 900ms cadence at half its depth — to .78, not .45, because this is content and a balance
that dims to half is a balance someone squints at.

- **Rule 1 is untouched.** No value moves and no value changes. Nothing interpolates, nothing counts,
  nothing slides. One property, opacity, on a figure that is already correct.
- **Only for a re-read, never a reload.** A reload asks a new question and the answer on screen is
  about to be wrong; that is a placeholder's job. `rereading` from `useAsync` is the one input.
- **Said as well as drawn.** The wrapper carries `busy`, so a screen reader is told the app is working.
  Nobody should need to see a pulse to know a number is being replaced.
- **Off under reduced motion**, where the value simply stays — which is the important half anyway.

## One room dissolving into the other

Messages comes in two rooms — the light lavender one it was designed from, and the app's own true black — and it now
**follows the phone** unless someone has chosen here. Someone whose phone is in light mode has already answered the
question, in the one place the whole OS asks; opening at black over that is the app choosing for them, having been told.
A tap on the sun/moon button is an answer about this room specifically, so it outranks the phone from then on.

A change used to land whole between two frames: ground, cards, words and handle, all at once. On the brightest change
this app can make, that is a flash — and on a phone that switches itself at dusk, a flash nobody asked for.

So the room being **left** stays for a moment, painted over the room that has **arrived**, and fades out over 250ms.
Both rooms are complete at every frame: the new one is fully drawn underneath, and the old one is simply becoming
transparent. Nothing is half-built and nothing assembles itself.

- **One property.** Opacity, on one pane of colour. The palette itself still swaps in place, instantly.
- **250ms**, the interaction scale, whether a finger or the phone made the change: a dissolve slower than that reads as
  the app catching up rather than answering.
- **No touches, no screen-reader focus.** For a quarter of a second it is a pane of colour, not a surface.
- **Off under reduced motion**, where the room simply changes — which is the whole of the information.

The rest of the app is true black and has no second palette to cross-fade to; this is the one themed surface it has.

## The sparkline's breath

Rule 1 is intact: the line **redraws instantly**, exactly as a candle mutates in place with no
transition. What breathes is the glyph's opacity — §6's .9 up to full over 150ms and back over 250ms.
No point grows, no segment draws itself, and nothing interpolates between two prices.

It says the one thing neither the line nor the price beside it can: *this is live*. A market list ten
minutes open and one that just refreshed are drawn identically, which is the "nothing" versus "not yet"
conflation the skeleton pulse exists to fix, running the other way — "still" versus "still arriving".

- **Driven by the data, never a clock.** The breath happens when the series changes, and at no other
  time. There is no loop: a sparkline breathing on a schedule asserts a feed is live while nothing is
  arriving, which is worse than a still line.
- **A change means a new latest point**, not a new array. A re-read returns a fresh array every time,
  so identity would make every refresh — changed or not — read as a tick.
- **Not on the first draw.** A glyph appearing is not a tick.
- **Opt-in.** A fixed historical series does not breathe, because nothing is arriving.
- **Off under reduced motion.**

## The stop's curtain

The kill switch signs an on-chain revoke from the person's own wallet, and after it every agent,
strategy and stop-loss is inert. It used to finish the way every other button finishes: a label
changed, a badge went green to red. The biggest thing this app can do passed with less ceremony than
a segmented control.

It now takes the screen for the length of the transaction. A curtain comes down — a red wash over a
blackout, the stop button's own red at the weight the design gives a destructive surface, because on a
true-black app a full-bleed #EF3B36 reads as a crash. It holds while the revoke is signed. When the
chain confirms, a badge scales in once, the words say what is now true, and the phone gives its one
two-beat haptic (`killTap` — a thud and a latch, `haptics.ts`).

Three properties, each on its own element, all collapsing to nothing under reduced motion.

What keeps it honest:

- **Both states are real.** `signing` is a revoke actually out for signature; `stopped` is set only
  once `revoke()` returns, which happens only when the chain shows the policy revoked. Nothing here
  is a timer standing in for a progress the app does not have.
- **A failure takes it away.** The curtain never stays up over an error — that would be the app
  claiming a stop it did not make. The screen underneath says what went wrong.
- **It cannot be dismissed while the signature is out.** There is nothing to go back to, and a
  curtain a stray touch could clear is a way to leave this screen unsure whether trading stopped.
- **The words carry it.** Under reduced motion, with a screen reader, in a screenshot: the same
  sentences, the same badge, the same detail line. The motion is the second telling.

## The agent orb's stages

"If you add motion" below named two things worth building, and this is both of them plus the two states
between: an orb that **breathes while its agent is working** and **pops once when a fill lands**.

| `stage` | What it draws | Why that property |
|---|---|---|
| `thinking` | scale 1 → 1.015, breathing, 3.6s | Alive. The one animations.md asked for by name. |
| `decided` | settles to rest, 250ms, then still | The agent has stopped; the screen now says what it decided. |
| `executing` | opacity 1 → .72, breathing, 900ms | In flight. The skeleton's cadence, because it means the same thing. |
| `filled` | one 250ms scale-in from .94 | The second thing "If you add motion" asked for. Once, on arrival. |

Two loops and two properties. **Scale means alive, opacity means in flight** — a second scale loop at a
different speed would read as the same state at a different frame rate.

The rules it obeys:

- **The stage is a prop, from what the screen knows** — a request in flight, a proposal waiting, an
  executor's answer. Never a timer, an interval or a sequence. An orb that performs a four-beat routine on
  a clock says "something is happening" while nothing is, which on a screen that moves money is a lie the
  animation tells. There is a test for this.
- **Motion is never the only carrier.** Every screen that passes a stage says the same thing in words. Under
  reduced motion the orb is simply still, and nothing is lost.
- **Off by default.** An orb with no stage does not move. A roster of twelve breathing orbs is a screen that
  will not sit still to be read, which is exactly what animations.md's ban on the pulsing status dot is about.
- **It stops when the state does**, and when the orb unmounts.

## The balance roll-over

Rule 1 says never animate a price, and it stands. A market quote that moves on screen implies a move
the market did not make, and a quote that ticks every few seconds would turn a quiet market into a
flickering one.

A balance is not a quote. It changes because something *happened* — a fill landed, a position moved,
money arrived — and a change that appears with no motion at all is the one event on the screen that
goes unannounced. `<RollingNumber roll>` hands each **changed** character over to the one replacing
it: the old character leaves the clip as the new one enters, upward when the figure rose and downward
when it fell. Characters that did not change do not move.

What it does not do is **count**. Every frame shows a character from the figure that was on screen or
a character from the figure that replaced it, and nothing in between — two real values, handed over.
There is no interpolated $4,9xx on the way from $4,862.18 to $4,901.02, because no such figure was
ever true.

Rules it obeys:

- **Opt-in, and only for the person's own money.** The default is still a snap, and a `figure="market"`
  price is never given `roll`.
- **180ms**, the interaction scale, because a hand-over is one character being replaced rather than a
  screen arriving.
- **Only what changed.** The separators, the currency mark and the digits that held still stay put.
- **Nothing while balances are hidden.** The figure is dots, and one dot replacing another is movement
  with nothing behind it.
- **Off under reduced motion**, where the new character is simply there.

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
  the block is gone — the price rule is untouched. Note precisely what this forbids: **a block standing
  where a figure should be**, which says a price is unknown when it is known. A real figure breathing
  while it is read again is the opposite claim and has its own section below.

900ms because the interaction scale does not apply. 150/180/250 is calibrated for a transition the
user *caused*; nobody pressed a skeleton. At 250 it strobes. At 900 it breathes.

The asset mark stays a skeleton until its logo has drawn — not only until the logo's address is known — and its block is
one step lighter than the sheet it sits on (`switchOff` on `surfaceAlt`). Drawn in the sheet's own grey, a loading
mark was invisible, and a row whose logo was still coming looked like a row with no logo at all.

## The tab bar gives way to Messages

Messages is a drawer that rises from the bottom over whatever screen you are on, and the tab bar is what it rises from.
Left standing, the bar sat under the scrim while the drawer covered it: two things claiming the bottom of the screen at
once. The bar now goes down as the drawer comes up — one property, on the drawer's own curves — so the drawer visibly takes
the bar's place, and the bar comes back as the drawer goes.

Up is 420ms on the arrival curve (`duration.enter`, ease-out), not the 250ms interaction scale. The drawer travels the
whole height of the screen, and at 250ms on the platform ease it read as a cut rather than a rise — worse, the slide ran
while the conversation list was still being built, so it had finished before anything could be drawn, and a screen
recording showed Messages appearing in 40ms. The rise now starts once the drawer has laid out. Down stays 250ms:
leaving is quicker than arriving.

It is continuity, not an entrance: nothing arrives, one thing makes room for another, and both are already on screen when
the move starts. While it is down the bar takes no taps and is hidden from a screen reader. Under reduced motion both
simply appear and disappear.

### The mark under the open place

The raised pill behind Home's glyph appeared and vanished between two frames. On the one control whose whole job is to
answer navigation, a state that swaps with no transition reads as a redraw rather than an answer.

It now grows into shape and shrinks away — `transform: scale`, 0 ↔ 1, over the 150ms the segmented thumb takes, because
selection must feel instant and 150 is the floor. One property: no slide, no fade, no travelling indicator between
items. There is one place on this bar; Swap and Messages are actions and are never selected, so there is nothing for an
indicator to travel to.

**The glyph's colour still snaps.** It is the state, and it has to be right in the frame the tap lands — including under
reduced motion, where the mark is simply there or not and the colour carries the whole thing on its own.
