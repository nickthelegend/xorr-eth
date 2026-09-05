/**
 * Circular icon button — the 34px `surfaceAlt` circle that sits in almost every screen header
 * (search on 24, sort on 16, gear on 2, back everywhere). design.md §1 `surfaceAlt`, §3 radius 50%.
 */
import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { ink, surfaces } from '../colors';
import { MIN_HIT } from '../space';
import { Icon, type IconName } from '../Icon';

export function IconButton({
  name,
  onPress,
  size = 34,
  glyphSize = 15,
  color = ink.i55,
  background = surfaces.surfaceAlt,
  accessibilityLabel,
  style,
  testID,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  glyphSize?: number;
  color?: string;
  background?: string;
  accessibilityLabel: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const slop = Math.max(0, (MIN_HIT - size) / 2);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={slop}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={{ pointerEvents: 'none' }}>
        <Icon name={name} size={glyphSize} color={color} />
      </View>
    </Pressable>
  );
}
