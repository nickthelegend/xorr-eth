/**
 * Volume — design.md §6.
 * Row under the candles, height 42, align-items flex-end, gap 6 matching the candle gutter.
 * Bars flex:1, radius 2 2 0 0, fill rgba(22,192,96,.5) / rgba(239,59,54,.5) following that
 * candle's direction.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { pnl } from '../design/colors';
import { CANDLE_GAP } from './Candlestick';

export function VolumeRow({
  /** 0-100 per bar, already normalised by projectVolume. */
  values,
  ups,
  height = 42,
  style,
}: {
  values: number[];
  ups: boolean[];
  height?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: CANDLE_GAP, height }, style]}
    >
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(1, (v / 100) * height),
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
            backgroundColor: ups[i] ? pnl.volUp : pnl.volDown,
          }}
        />
      ))}
    </View>
  );
}
