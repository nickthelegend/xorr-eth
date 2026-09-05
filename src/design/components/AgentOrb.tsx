/**
 * AgentOrb — design.md §5.
 *
 * `radial-gradient(circle at 32% 26%, c1, c2 74%)`. The off-center origin IS the specular
 * highlight and MUST NOT MOVE (design.md §1). Rendered with react-native-svg's <RadialGradient>
 * using exactly the numbers in src/design/gradients.ts.
 *
 * Optional: bloom, specular ellipse, face, P&L badge, name + status line.
 * Idle breathe is the ONE motion animations.md sanctions here — active agents only.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { ink, pnl } from '../colors';
import { DURATION } from '../motion';
import { RADIAL, type GradientPair } from '../gradients';
import { type } from '../type';
import { useReducedMotion } from '../useReducedMotion';

/** design.md §5: the sanctioned sizes. */
export type OrbSize = 52 | 56 | 70 | 74 | 84 | 104 | 34 | 38 | 22 | 16 | 106;

export type AgentOrbProps = {
  gradient: GradientPair;
  size: number;
  /** 0 14px 40px rgba(c1,.4) */
  bloom?: boolean;
  /** White ellipse ~28% width, blur(2-3px), top ~17%, left ~24%. */
  specular?: boolean;
  /** Two 9x13 round-rect eyes at ~40% height + a 16x7 smile arc. */
  face?: boolean;
  /** P&L chip at top:-8 left:-6, 10/700 upInk on up. */
  badge?: string;
  /** animations.md "If you add motion": 3-4s scale 1.0 -> 1.015, ACTIVE agents only. */
  breathe?: boolean;
  style?: ViewStyle;
};

export function AgentOrb({
  gradient,
  size,
  bloom = false,
  specular = false,
  face = false,
  badge,
  breathe = false,
  style,
}: AgentOrbProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!breathe || reduced) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withTiming(1.015, { duration: DURATION.breatheHalf, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(scale);
  }, [breathe, reduced, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const id = `orb-${gradient.c1.slice(1)}-${gradient.c2.slice(1)}`;
  // Face geometry scales with the orb; design.md gives it at the 104px reference size.
  const k = size / 104;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          bloom && {
            shadowColor: gradient.c1,
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.4,
            shadowRadius: 40,
            elevation: 10,
          },
          animated,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r={RADIAL.r} fx={RADIAL.fx} fy={RADIAL.fy}>
              <Stop offset="0%" stopColor={gradient.c1} />
              <Stop offset={RADIAL.c2Stop} stopColor={gradient.c2} />
              <Stop offset="100%" stopColor={gradient.c2} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={`url(#${id})`} />
          {specular ? (
            // design.md §5: white ellipse ~28% width, top ~17%, left ~24%.
            <Ellipse cx={38} cy={23} rx={14} ry={9} fill="#FFFFFF" opacity={0.28} />
          ) : null}
        </Svg>

        {face ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Two 9x13 round-rect eyes at ~40% height. */}
            <View
              style={{
                position: 'absolute',
                top: size * 0.4 - 13 * k * 0.5,
                left: size * 0.31,
                width: 9 * k,
                height: 13 * k,
                borderRadius: 5 * k,
                backgroundColor: '#0B0B0B',
                opacity: 0.82,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: size * 0.4 - 13 * k * 0.5,
                right: size * 0.31,
                width: 9 * k,
                height: 13 * k,
                borderRadius: 5 * k,
                backgroundColor: '#0B0B0B',
                opacity: 0.82,
              }}
            />
            {/* 16x7 smile arc (border-radius 0 0 12px 12px). */}
            <View
              style={{
                position: 'absolute',
                top: size * 0.58,
                alignSelf: 'center',
                width: 16 * k,
                height: 7 * k,
                borderBottomLeftRadius: 12 * k,
                borderBottomRightRadius: 12 * k,
                backgroundColor: '#0B0B0B',
                opacity: 0.82,
              }}
            />
          </View>
        ) : null}
      </Animated.View>

      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -8,
            left: -6,
            backgroundColor: pnl.up,
            borderRadius: 9,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={[type.tag, { color: pnl.upInk, letterSpacing: 0 }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The label block that sits under an orb — design.md §5:
 * name 12-12.5/600 white, then status 10.5/600 (`up` Active/New, `ink40` Paused).
 */
export function AgentOrbLabel({ name, status }: { name: string; status: 'Active' | 'New' | 'Paused' }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: ink.full }}>{name}</Text>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: '600',
          color: status === 'Paused' ? ink.i40 : pnl.up,
        }}
      >
        {status}
      </Text>
    </View>
  );
}
