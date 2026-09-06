/**
 * Candlestick — design.md §6, the centerpiece.
 *
 * Per candle, inside a flex:1 relative column (parent row, gap 6):
 *   Wick — absolute, left 50%, translateX(-50%), width 1.6, radius 2, opacity .75-.8, body color
 *   Body — absolute, left 0 right 0, radius 3, candleUp/candleDown, bloom, top/height from the
 *          projection
 *
 * THE BLOOM. design.md §3: "Candle bodies carry a bloom, not a shadow ... This is what makes the
 * charts read as premium — keep it."  0 0 10px rgba(22,192,96,.35) up / rgba(239,59,54,.32) down.
 *
 * Porting it: iOS honours a tinted zero-offset shadow directly. Android's `elevation` cannot tint,
 * so there the bloom is painted as an SVG feGaussianBlur copy of the body underneath it. Both
 * paths are exercised by the fidelity harness; neither animates.
 *
 * animations.md: "Candles. No draw-on, no grow-from-baseline. The chart is data; it renders
 * complete. Live updates mutate the last candle in place with no transition."
 */
import React from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, Rect } from 'react-native-svg';
import { pnl } from '../design/colors';
import { candleBloom } from '../design/space';
import type { ProjectedCandle } from './project';

export const CANDLE_GAP = 6;
const WICK_W = 1.6;

export type CandlestickProps = {
  candles: ProjectedCandle[];
  height: number;
  style?: ViewStyle;
  /**
   * Make the candles selectable, reporting the index pressed — or null to clear.
   *
   * The chart is the screen's centrepiece and it was read-only: a user could see the shape and
   * not the numbers behind any single bar. The data is already loaded, so a readout costs nothing
   * but the wiring.
   *
   * Omitting this leaves the chart exactly as it was, non-interactive, which is right where it is
   * used as an illustration rather than as the subject of the screen.
   */
  onSelect?: (index: number | null) => void;
  selected?: number | null;
};

export function Candlestick({ candles, height, style, onSelect, selected }: CandlestickProps) {
  return (
    <View
      style={[{ flexDirection: 'row', gap: CANDLE_GAP, height }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Price chart, ${candles.length} candles, last candle ${
        candles[candles.length - 1]?.up ? 'up' : 'down'
      }`}
    >
      {candles.map((c, i) =>
        onSelect ? (
          <Pressable
            key={i}
            onPress={() => onSelect(selected === i ? null : i)}
            accessibilityRole="button"
            accessibilityLabel={`Candle ${i + 1} of ${candles.length}`}
            accessibilityState={{ selected: selected === i }}
            // flex:1 so the touch target is the whole column, not just the drawn body — a 1.6px
            // wick is not something anyone can hit.
            style={{ flex: 1 }}
          >
            <Candle c={c} height={height} dimmed={selected !== null && selected !== undefined && selected !== i} />
          </Pressable>
        ) : (
          <Candle key={i} c={c} height={height} />
        ),
      )}
    </View>
  );
}

function Candle({
  c,
  height,
  dimmed = false,
}: {
  c: ProjectedCandle;
  height: number;
  /**
   * Everything except the selected candle steps back.
   *
   * A highlight on the selection would add a colour; dimming the rest keeps the palette exactly as
   * it is and still makes the choice obvious. It is a state change, not a transition —
   * animations.md is explicit that candles do not animate, and this does not.
   */
  dimmed?: boolean;
}) {
  const color = c.up ? pnl.candleUp : pnl.candleDown;
  const bloom = c.up ? candleBloom.up : candleBloom.down;
  const pct = (v: number) => (v / 100) * height;

  return (
    <View style={{ flex: 1, position: 'relative', opacity: dimmed ? 0.35 : 1 }}>
      {/* Wick */}
      <View
        style={{
          position: 'absolute',
          left: '50%',
          transform: [{ translateX: -WICK_W / 2 }],
          width: WICK_W,
          borderRadius: 2,
          opacity: 0.78,
          backgroundColor: color,
          top: pct(c.wickTop),
          height: Math.max(0, pct(c.wickH)),
        }}
      />
      {/* Bloom — Android only; iOS gets it from the body's own tinted shadow. */}
      {Platform.OS === 'android' ? (
        <AndroidBloom color={color} top={pct(c.bodyTop)} height={pct(c.bodyH)} />
      ) : null}
      {/* Body */}
      <View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            borderRadius: 3,
            backgroundColor: color,
            top: pct(c.bodyTop),
            height: Math.max(1, pct(c.bodyH)),
          },
          Platform.OS === 'ios' ? bloom : null,
        ]}
      />
    </View>
  );
}

/**
 * Android bloom: a blurred copy of the body rectangle, drawn behind it. `elevation` cannot tint a
 * shadow, and a plain elevation reads as a grey drop shadow — which is exactly the "shadow, not
 * bloom" design.md rules out.
 */
function AndroidBloom({ color, top, height }: { color: string; top: number; height: number }) {
  const PAD = 10; // the 10px blur radius from the spec
  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: -PAD,
        right: -PAD,
        top: top - PAD,
        height: Math.max(1, height) + PAD * 2,
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
            <FeGaussianBlur stdDeviation="4" />
          </Filter>
        </Defs>
        <Rect
          x={PAD}
          y={PAD}
          width={`calc(100% - ${PAD * 2}px)` as unknown as number}
          height={Math.max(1, height)}
          rx={3}
          fill={color}
          opacity={0.35}
          filter="url(#bloom)"
        />
      </Svg>
    </View>
  );
}
