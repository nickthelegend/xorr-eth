/**
 * Sparkline.tsx
 *
 * design.md §6: `90×30 SVG · stroke #fff · stroke-width 1.4 · stroke-linejoin round ·
 * no fill · opacity .9`. Sits between the symbol and the price in market rows.
 *
 * **Direction is carried by the adjacent change text, not the line colour.** A green
 * sparkline and a green change figure say the same thing twice, and a green sparkline on
 * a row whose change is red is a contradiction the eye catches before the numbers do. The
 * line is white; the sign lives next to it.
 *
 * The 90×30 is fixed by §6, so this chart doesn't measure — it is a glyph, not a plot.
 *
 * ## `live` — the breath on a tick (2026-09-17)
 *
 * animations.md's first rule is that a price never animates, and this does not break it: the line
 * **redraws instantly**, exactly as a candle mutates in place with no transition. What breathes is the
 * glyph's opacity — up to full over 150ms and back to §6's .9 over 250ms — and only when the series it
 * was handed actually changed.
 *
 * It says the one thing neither the line nor the price beside it can: *this is live*. A market list that
 * has been open for ten minutes and one that just refreshed are drawn identically, which is the same
 * "nothing" versus "not yet" conflation the skeleton pulse exists to fix, in the other direction —
 * "still" versus "still arriving". A tick lands, the row acknowledges it, and the acknowledgement fades.
 *
 * The rules it keeps:
 *
 * - **One property, and never a value.** Opacity on the whole glyph. No point grows, no segment draws
 *   itself, nothing interpolates between two prices.
 * - **Driven by the data, not a clock.** The breath happens when the series changes and at no other
 *   time. There is no loop: a sparkline breathing on a schedule would assert a feed is live while
 *   nothing was arriving, which is worse than a still line.
 * - **Not on the first draw.** A glyph appearing is not a tick.
 * - **Opt-in.** A sparkline of a fixed historical series does not breathe, because nothing is arriving.
 * - **Off under reduced motion**, where the line simply redraws.
 */
import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { duration, timing, useReducedMotion } from '../motion';
import { chart, colors } from '../tokens';

export interface SparklineProps {
  /** The series, in value space. Scaled to its own extent. */
  data: readonly number[];
  /**
   * The series arrives from a feed, so a change to it is a tick worth acknowledging.
   *
   * Off for a fixed historical series: nothing is arriving, so nothing should suggest it is.
   */
  live?: boolean;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * What makes one reading of a series different from the next.
 *
 * Its length and its latest point, not the whole array: a re-read that returns the same window returns a
 * NEW array every time, and identity would have every refresh — successful or not, changed or not — read
 * as a tick. The one thing that makes a tick a tick is that the newest point is new.
 */
function latestPoint(data: readonly number[]): string {
  return data.length === 0 ? '' : `${data.length}:${data[data.length - 1]}`;
}

export function Sparkline({
  data,
  live = false,
  width = chart.spark.width,
  height = chart.spark.height,
  style,
  testID,
}: SparklineProps) {
  const reduced = useReducedMotion();
  /** 0 at rest, 1 at the top of the breath. */
  const breath = useSharedValue(0);
  const tick = latestPoint(data);
  const seen = useRef(tick);

  useEffect(() => {
    if (seen.current === tick) return;
    seen.current = tick;
    // A glyph that has not drawn yet has nothing to acknowledge, and a still line is the setting's answer.
    if (!live || reduced || tick === '') return;
    breath.set(
      withSequence(
        withTiming(1, timing(duration.fast, reduced)),
        withTiming(0, timing(duration.slow, reduced)),
      ),
    );
  }, [tick, live, reduced, breath]);

  const breathing = useAnimatedStyle(() => ({
    opacity: chart.spark.opacity + breath.get() * (1 - chart.spark.opacity),
  }));

  if (data.length < 2) {
    return <View testID={testID} style={[{ width, height }, style]} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  /* Half the stroke at the top and bottom, so a peak isn't shaved off. */
  const pad = chart.spark.strokeWidth / 2;
  const plotHeight = height - pad * 2;

  const d = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = pad + ((max - v) / span) * plotHeight;
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');

  return (
    // §6's .9 lives on this view now rather than on the Svg, because it is what breathes.
    <Animated.View testID={testID} style={[style, breathing]}>
      <Svg width={width} height={height}>
        <Path
          d={d}
          fill="none"
          stroke={colors.ink}
          strokeWidth={chart.spark.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}
