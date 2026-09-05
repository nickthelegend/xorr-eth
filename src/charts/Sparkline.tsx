/**
 * Sparkline — design.md §6.
 * 90x30 SVG, stroke #fff, stroke-width 1.4, round join, no fill, opacity .9.
 * Sits between the symbol and the price in market rows.
 *
 * "Direction is carried by the adjacent change text, not the line color." The stroke is white,
 * always — a green/red sparkline would be a second meaning for the P&L colors.
 */
import React from 'react';
import Svg, { Polyline } from 'react-native-svg';
import { ink } from '../design/colors';

export const SPARK_W = 90;
export const SPARK_H = 30;

export function Sparkline({ points }: { points: string }) {
  return (
    <Svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      opacity={0.9}
      // Decorative: the price and change text beside it carry the information. `aria-hidden` is
      // the cross-platform spelling; the iOS/Android-only a11y props leak onto the DOM as unknown
      // attributes on web and React logs an error for each one.
      aria-hidden
    >
      <Polyline
        points={points}
        fill="none"
        stroke={ink.full}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function sparkFromPrices(prices: readonly number[]): string {
  if (prices.length === 0) return '';
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  const span = hi - lo || 1;
  const step = prices.length > 1 ? SPARK_W / (prices.length - 1) : 0;
  return prices
    .map((p, i) => `${(i * step).toFixed(1)},${(((hi - p) / span) * (SPARK_H - 6) + 3).toFixed(1)}`)
    .join(' ');
}
