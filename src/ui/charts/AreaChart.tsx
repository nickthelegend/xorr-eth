/**
 * AreaChart.tsx — the equity curve.
 *
 * design.md §6:
 *   Gradient fill polygon (stop-opacity .26–.3 → 0) under a stroke-width 2,
 *   stroke-linejoin/linecap round polyline. Grid lines rgba(255,255,255,.06) at 25%
 *   intervals, behind the fill. End dot r=3.2.
 *
 * §6 writes this as `viewBox="0 0 360 110" preserveAspectRatio="none"` because the
 * prototype was HTML. That is kept as *values* but not as geometry: a non-uniform scale
 * stretches the 2px stroke to a different thickness horizontally and vertically, and
 * turns the r=3.2 end dot into an ellipse. This measures its box and draws in real
 * points instead, so the stroke is 2 in both axes and the dot is round. Every coordinate
 * is still derived — from the data and the measured size, never placed.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { chart, colors } from '../tokens';
import { useMeasuredBox } from './useMeasuredBox';

export interface AreaChartProps {
  /** The series, in value space. Scaled to its own min/max unless bounds are given. */
  data: readonly number[];
  /** The line and fill colour. P&L green for a winning curve; the instrument's own
   *  colour on a contract screen, where the line is identity, not outcome. */
  color?: string;
  height: number;
  /** Fix the vertical scale — otherwise the series' own extent is used. */
  bounds?: { min: number; max: number };
  /** Grid lines at 25% intervals, behind the fill. */
  grid?: boolean;
  /** The dot on the last point. */
  endDot?: boolean;
  /** Vertical room so a stroke at the very top or bottom isn't clipped in half. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AreaChart({
  data,
  color = colors.up,
  height,
  bounds,
  grid = false,
  endDot = false,
  inset,
  style,
  testID,
}: AreaChartProps) {
  const [box, onLayout] = useMeasuredBox();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `area-${uid}`;

  /* Half the stroke, plus the dot's radius when there is one — the smallest inset that
     guarantees nothing is clipped. It applies on both axes: a round linecap at the last
     point loses half of itself at the right edge, and the end dot loses more than half. */
  const pad =
    inset ??
    (endDot
      ? chart.area.endDotRadius
      : chart.area.strokeWidth / 2);

  const min = bounds?.min ?? Math.min(...(data.length > 0 ? data : [0]));
  const max = bounds?.max ?? Math.max(...(data.length > 0 ? data : [1]));
  const span = max - min || 1;

  const plotWidth = Math.max(0, box.width - pad * 2);
  const plotHeight = Math.max(0, height - pad * 2);
  const xOf = (i: number) =>
    data.length > 1 ? pad + (i / (data.length - 1)) * plotWidth : box.width / 2;
  const yOf = (v: number) => pad + ((max - v) / span) * plotHeight;

  const points = data.map((v, i) => `${xOf(i)},${yOf(v)}`);
  const line = points.length > 0 ? `M ${points.join(' L ')}` : '';
  const area =
    points.length > 0
      ? `${line} L ${xOf(data.length - 1)},${height} L ${xOf(0)},${height} Z`
      : '';

  const lastValue = data.length > 0 ? data[data.length - 1] : undefined;

  return (
    <View testID={testID} style={[{ height }, style]} onLayout={onLayout}>
      {box.width > 0 && data.length > 0 && (
        <Svg width={box.width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset={0} stopColor={color} stopOpacity={chart.area.fillOpacityTop} />
              <Stop offset={1} stopColor={color} stopOpacity={chart.area.fillOpacityBottom} />
            </LinearGradient>
          </Defs>

          {grid &&
            chart.area.gridAt.map((t) => (
              <Line
                key={t}
                x1={0}
                y1={t * height}
                x2={box.width}
                y2={t * height}
                stroke={chart.area.gridColor}
                strokeWidth={1}
              />
            ))}

          <Path d={area} fill={`url(#${gradientId})`} />
          <Path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={chart.area.strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {endDot && lastValue !== undefined && (
            <Circle
              cx={xOf(data.length - 1)}
              cy={yOf(lastValue)}
              r={chart.area.endDotRadius}
              fill={color}
            />
          )}
        </Svg>
      )}
    </View>
  );
}
