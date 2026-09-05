/**
 * TP/SL scrub ruler — design.md §6.
 *
 * height 22, repeating 1px ticks every 9px in #E4E4E9, background-size 100% 12px, vertically
 * centred. Marker width 2, full height, TP green / SL red.
 *
 * RN has no repeating-linear-gradient, so the ticks are a generated SVG pattern at the same
 * pitch — 1px on, 8px off, 12px tall, centred in the 22px band.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { sheet } from '../design/colors';

const H = 22;
const TICK_H = 12;
const PITCH = 9;

export function Ruler({
  /** 0-100 position of the marker. */
  markerPct,
  color,
  width,
  style,
  accessibilityLabel,
}: {
  markerPct: number;
  color: string;
  width: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const count = Math.max(1, Math.floor(width / PITCH));
  const y = (H - TICK_H) / 2;
  return (
    <View
      style={[{ height: H, width: '100%' }, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width="100%" height={H}>
        {Array.from({ length: count }, (_, i) => (
          <Rect key={i} x={i * PITCH} y={y} width={1} height={TICK_H} fill={sheet.tick} />
        ))}
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: `${Math.min(100, Math.max(0, markerPct))}%`,
          top: 0,
          bottom: 0,
          width: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
