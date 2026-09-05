/**
 * Area / equity curve — design.md §6.
 *
 * SVG viewBox="0 0 360 110" preserveAspectRatio="none". Gradient fill polygon
 * (stop-opacity .26-.3 -> 0) under a stroke-width:2, round join/cap polyline.
 * Grid lines rgba(255,255,255,.06) at 25% intervals, BEHIND the fill. End dot r=3.2.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Polygon, Polyline, Stop } from 'react-native-svg';
import { ink } from '../design/colors';

const VB_W = 360;
const VB_H = 110;

export function AreaChart({
  /** "x,y x,y ..." in the 360x110 viewBox. */
  points,
  stroke = ink.full,
  height,
  grid = true,
  gridColor = 'rgba(255,255,255,0.06)',
  fillOpacity = 0.28,
  style,
  accessibilityLabel,
}: {
  points: string;
  stroke?: string;
  height: number;
  grid?: boolean;
  gridColor?: string;
  fillOpacity?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const id = `area-${stroke.replace('#', '')}`;
  const parsed = points.trim().split(/\s+/);
  const last = parsed[parsed.length - 1]?.split(',').map(Number) ?? [0, 0];
  // Close the polygon down to the baseline for the gradient fill.
  const polygon = `${points} ${VB_W},${VB_H} 0,${VB_H}`;

  return (
    <View
      style={[{ height, width: '100%' }, style]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={fillOpacity} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Grid sits behind the fill — design.md is explicit about the order. */}
        {grid
          ? [0.25, 0.5, 0.75].map((t) => (
              <Line
                key={t}
                x1={0}
                y1={VB_H * t}
                x2={VB_W}
                y2={VB_H * t}
                stroke={gridColor}
                strokeWidth={1}
              />
            ))
          : null}
        <Polygon points={polygon} fill={`url(#${id})`} />
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={last[0]} cy={last[1]} r={3.2} fill={stroke} />
      </Svg>
    </View>
  );
}

/**
 * Build a 360x110 polyline from raw prices. Used when live data replaces the handoff's
 * hand-authored geometry — the shape then comes from the market, not from a designer.
 */
export function pointsFromPrices(prices: readonly number[]): string {
  if (prices.length === 0) return '';
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  const span = hi - lo || 1;
  const step = prices.length > 1 ? VB_W / (prices.length - 1) : 0;
  return prices
    .map((p, i) => `${(i * step).toFixed(1)},${(((hi - p) / span) * (VB_H - 8) + 4).toFixed(1)}`)
    .join(' ');
}
