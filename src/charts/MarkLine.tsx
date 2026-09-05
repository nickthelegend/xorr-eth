/**
 * Last-price marker — design.md §6.
 *
 * "dashed rule 1px dashed rgba(255,255,255,.22) (or rgba(11,11,11,.2) on white) at y(lastClose)%,
 * transform translateY(-50%), with a chip at the end: white on black in the dark chart,
 * #0B0B0B on white in the light sheet, prefixed `Mark` where a TP chip occupies the right edge."
 *
 * RN cannot draw a reliable 1px dashed border at every width, so the rule is an SVG line with
 * strokeDasharray.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { ink, sheet } from '../design/colors';
import { type } from '../design/type';

export function MarkLine({
  /** % from the top, from the active projection. */
  topPct,
  height,
  label,
  variant = 'dark',
  /** design.md: prefixed "Mark" where a TP chip occupies the right edge. */
  prefixed = false,
}: {
  topPct: number;
  height: number;
  label: string;
  variant?: 'dark' | 'sheet';
  prefixed?: boolean;
}) {
  const stroke = variant === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(11,11,11,0.2)';
  const chipBg = variant === 'dark' ? ink.full : sheet.ink;
  const chipFg = variant === 'dark' ? '#000000' : '#FFFFFF';
  const top = (topPct / 100) * height;

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        transform: [{ translateY: -9 }],
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, height: 18, justifyContent: 'center' }}>
        <Svg width="100%" height={1}>
          <Line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={stroke} strokeWidth={1} strokeDasharray="3 3" />
        </Svg>
      </View>
      <View
        style={{
          backgroundColor: chipBg,
          borderRadius: 6,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginLeft: 6,
        }}
      >
        <Text style={[type.tagSm, { color: chipFg, letterSpacing: 0, textTransform: 'none' }]}>
          {prefixed ? `Mark ${label}` : label}
        </Text>
      </View>
    </View>
  );
}
