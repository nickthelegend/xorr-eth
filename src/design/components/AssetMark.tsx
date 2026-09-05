/**
 * The gradient asset mark on a market row — design.md §5 Row, §1 gradients.
 * "Asset marks reuse the same recipe — every instrument carries c1/c2."
 * 34px on screen 24, 30-32 elsewhere. Radius 50% for coins; the recipe is identical either way.
 */
import React from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { RADIAL, type GradientPair } from '../gradients';

export function AssetMark({ gradient, size = 34 }: { gradient: GradientPair; size?: number }) {
  const id = `mk-${gradient.c1.slice(1)}${gradient.c2.slice(1)}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      // Decorative: the symbol and price beside it carry the information.
      aria-hidden
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r={RADIAL.r} fx={RADIAL.fx} fy={RADIAL.fy}>
          <Stop offset="0%" stopColor={gradient.c1} />
          <Stop offset={RADIAL.c2Stop} stopColor={gradient.c2} />
          <Stop offset="100%" stopColor={gradient.c2} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${id})`} />
    </Svg>
  );
}
