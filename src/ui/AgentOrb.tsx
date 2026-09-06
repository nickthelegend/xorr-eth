/**
 * AgentOrb.tsx — the agent's face.
 *
 * design.md §5:
 *   size 52 / 56 / 70 / 74 / 84 / 104 · border-radius 50%
 *   background radial-gradient(circle at 32% 26%, c1, c2 74%)
 *   optional bloom     0 14px 40px rgba(<c1>,.4)
 *   optional specular  white ellipse, ~28% width, blur 2–3px, top ~17%, left ~24%
 *   optional face      two 9×13 round-rect eyes at ~40% height, 16×7 smile arc
 *   optional badge     P&L chip at top −8 left −6, 10/700 upInk on up
 *   under it           name 12–12.5/600 white, status 10.5/600 — up Active/New, ink40 Paused
 *
 * §1: "the off-center origin is the specular highlight and must not move." So `cx`/`cy`
 * are constants here, not props.
 *
 * The CSS `circle at 32% 26%` with no explicit size ends at the *farthest corner* — from
 * (.32,.26) that is (1,1), at √(.68² + .74²) = 1.005 of the box. Hence `r="100.5%"`, and
 * the `c2` stop at .74 of that radius, exactly as CSS places it.
 *
 * Every dimension below is a fraction of `size`, measured off the 74px orb in the
 * prototype, so all six sizes are the same drawing rather than six hand-placed ones.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Text, Value } from './Text';
import { colors, orbBloom, radius, size as metrics, space, type Gradient } from './tokens';

/** The six sizes design.md §5 sanctions. */
export type OrbSize = 52 | 56 | 70 | 74 | 84 | 104;

export type OrbStatus = 'active' | 'new' | 'paused';

export interface AgentOrbProps {
  gradient: Gradient;
  size?: OrbSize;
  /** `0 14px 40px rgba(c1,.4)` — the agent's own colour, not a black shadow. */
  bloom?: boolean;
  /** The white highlight. On by default; it is what makes the sphere read as a sphere. */
  specular?: boolean;
  /** Eyes and a smile. Off for asset marks, which reuse the same gradient recipe. */
  face?: boolean;
  /** A P&L chip pinned outside the top-left of the orb. Already formatted, with a sign. */
  badge?: string;
  /** Positive or negative P&L on the badge. */
  badgeTone?: 'up' | 'down';
  /** Name under the orb. */
  name?: string;
  /** Status word under the name. Green for active/new, `ink40` for paused. */
  status?: OrbStatus;
  /** Overrides the status word. Defaults to Active / New / Paused. */
  statusLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/* Geometry, as fractions of the orb. Measured from the 74px orb in the prototype. */
const GRADIENT_CX = '32%';
const GRADIENT_CY = '26%';
const GRADIENT_R = '100.5%';
const GRADIENT_C2_STOP = 0.74;

const SPECULAR = { w: 0.28, h: 0.18, left: 0.24, top: 0.17, blur: 0.035 };
const EYE = { w: 9 / 74, h: 13 / 74, top: 30 / 74, left: 21 / 74 };
const SMILE = { w: 16 / 74, h: 7 / 74, bottom: 16 / 74 };
const BADGE_OFFSET = { top: -8, left: -6 };

const STATUS_LABEL: Readonly<Record<OrbStatus, string>> = {
  active: 'Active',
  new: 'New',
  paused: 'Paused',
};

export function AgentOrb({
  gradient,
  size = 70,
  bloom = false,
  specular = true,
  face = false,
  badge,
  badgeTone = 'up',
  name,
  status,
  statusLabel,
  style,
  testID,
}: AgentOrbProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `orb-g-${uid}`;
  const blurId = `orb-b-${uid}`;

  const eyeW = EYE.w * size;
  const eyeH = EYE.h * size;
  const eyeY = EYE.top * size;
  const eyeLeftX = EYE.left * size;
  const eyeRightX = size - EYE.left * size - eyeW;

  const smileW = SMILE.w * size;
  const smileH = SMILE.h * size;
  const smileX = (size - smileW) / 2;
  const smileY = size - SMILE.bottom * size - smileH;
  const smileR = Math.min(smileH, smileW / 2);

  const orb = (
    <View
      style={
        bloom
          ? { borderRadius: radius.full, boxShadow: orbBloom(gradient.c1) }
          : undefined
      }
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient
            id={gradientId}
            cx={GRADIENT_CX}
            cy={GRADIENT_CY}
            r={GRADIENT_R}
          >
            <Stop offset={0} stopColor={gradient.c1} />
            <Stop offset={GRADIENT_C2_STOP} stopColor={gradient.c2} />
          </RadialGradient>
          <Filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <FeGaussianBlur stdDeviation={SPECULAR.blur * size} />
          </Filter>
        </Defs>

        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />

        {specular && (
          <Ellipse
            cx={(SPECULAR.left + SPECULAR.w / 2) * size}
            cy={(SPECULAR.top + SPECULAR.h / 2) * size}
            rx={(SPECULAR.w / 2) * size}
            ry={(SPECULAR.h / 2) * size}
            fill={colors.ink}
            opacity={0.5}
            filter={`url(#${blurId})`}
          />
        )}

        {face && (
          <>
            <Rect
              x={eyeLeftX}
              y={eyeY}
              width={eyeW}
              height={eyeH}
              rx={eyeW / 2}
              fill={colors.ink}
            />
            <Rect
              x={eyeRightX}
              y={eyeY}
              width={eyeW}
              height={eyeH}
              rx={eyeW / 2}
              fill={colors.ink}
            />
            <Path
              d={
                `M ${smileX} ${smileY}` +
                ` H ${smileX + smileW}` +
                ` A ${smileR} ${smileR} 0 0 1 ${smileX + smileW - smileR} ${smileY + smileH}` +
                ` H ${smileX + smileR}` +
                ` A ${smileR} ${smileR} 0 0 1 ${smileX} ${smileY}` +
                ' Z'
              }
              fill={colors.ink}
            />
          </>
        )}
      </Svg>

      {badge !== undefined && (
        <View
          style={{
            position: 'absolute',
            top: BADGE_OFFSET.top,
            left: BADGE_OFFSET.left,
            paddingVertical: space.s2,
            paddingHorizontal: space.s6,
            borderRadius: radius.square,
            backgroundColor: badgeTone === 'up' ? colors.up : colors.down,
          }}
        >
          <Value variant="chipSm" color={badgeTone === 'up' ? colors.upInk : colors.ink}>
            {badge}
          </Value>
        </View>
      )}
    </View>
  );

  if (name === undefined && status === undefined) {
    return (
      <View testID={testID} style={style}>
        {orb}
      </View>
    );
  }

  return (
    <View testID={testID} style={[{ alignItems: 'center', gap: space.s8 }, style]}>
      {orb}
      {name !== undefined && (
        <Text variant="orbName">{name}</Text>
      )}
      {status !== undefined && (
        <Text
          variant="orbStatus"
          color={status === 'paused' ? colors.ink40 : colors.up}
        >
          {statusLabel ?? STATUS_LABEL[status]}
        </Text>
      )}
    </View>
  );
}

/**
 * Asset marks reuse the orb recipe at list-row scale — same gradient, no face, no bloom.
 * `data/markets.json` carries a `c1`/`c2` for every instrument.
 */
export function AssetMark({
  gradient,
  size = metrics.mark,
  style,
  testID,
}: {
  gradient: Gradient;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `mark-g-${uid}`;

  return (
    <View testID={testID} style={style}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={gradientId} cx={GRADIENT_CX} cy={GRADIENT_CY} r={GRADIENT_R}>
            <Stop offset={0} stopColor={gradient.c1} />
            <Stop offset={GRADIENT_C2_STOP} stopColor={gradient.c2} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
