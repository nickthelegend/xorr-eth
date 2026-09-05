/**
 * Stepper — design.md §5.
 *
 * [26px circle −] [value 14.5/700, min-width 70-88, center] [26px circle +], gap 8-10.
 * Circles #1B1C1E (dark) or #F2F2F5 (light sheet), glyph 15px.
 *
 * "Fixed min-width on the value is mandatory — without it the row jitters as digits change."
 * design.md §7: "Steppers are 26px visually — expand the touch area, don't grow the circle."
 */
import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { ink, sheet, surfaces } from '../colors';
import { MIN_HIT } from '../space';
import { type } from '../type';

const CIRCLE = 26;
/** hitSlop that lifts a 26px circle to the 44pt floor without changing a pixel of the visual. */
const SLOP = (MIN_HIT - CIRCLE) / 2;

export type StepperProps = {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  /** MANDATORY, and why: without it the row jitters as digits change. design.md §5. */
  valueMinWidth?: number;
  variant?: 'dark' | 'sheet';
  gap?: number;
  /** Optional colored pill behind the value — screen 6's TP/SL steppers. */
  valuePillColor?: string;
  valueInkColor?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  valueMinWidth = 78,
  variant = 'dark',
  gap = 10,
  valuePillColor,
  valueInkColor,
  style,
  accessibilityLabel,
}: StepperProps) {
  const circleBg = variant === 'sheet' ? sheet.fill : surfaces.control;
  const glyph = variant === 'sheet' ? sheet.ink : ink.full;
  const valueColor = valueInkColor ?? (variant === 'sheet' ? sheet.ink : ink.full);

  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: value }}
    >
      <Circle
        glyph="−"
        bg={circleBg}
        fg={glyph}
        onPress={onDecrement}
        disabled={!canDecrement}
        label={`Decrease ${accessibilityLabel ?? ''}`.trim()}
      />
      <View
        style={[
          {
            minWidth: valueMinWidth,
            alignItems: 'center',
            justifyContent: 'center',
          },
          valuePillColor
            ? {
                backgroundColor: valuePillColor,
                borderRadius: 16,
                paddingVertical: 5,
                paddingHorizontal: 12,
              }
            : null,
        ]}
      >
        <Text style={[type.stepperValue, { color: valueColor }]}>{value}</Text>
      </View>
      <Circle
        glyph="+"
        bg={circleBg}
        fg={glyph}
        onPress={onIncrement}
        disabled={!canIncrement}
        label={`Increase ${accessibilityLabel ?? ''}`.trim()}
      />
    </View>
  );
}

function Circle({
  glyph,
  bg,
  fg,
  onPress,
  disabled,
  label,
}: {
  glyph: string;
  bg: string;
  fg: string;
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={SLOP}
      style={({ pressed }) => ({
        width: CIRCLE,
        height: CIRCLE,
        borderRadius: CIRCLE / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 15, lineHeight: 18, color: fg, fontWeight: '500' }}>{glyph}</Text>
    </Pressable>
  );
}
