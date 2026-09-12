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
 *
 * `identity` draws the face from the agent's name instead (`agentGlyph`): eyes, a mouth and a
 * mark on the sphere, the same for that name on every screen. The orb — gradient, specular,
 * bloom — is untouched; without `identity` the face is §5's single design.
 */
import React from 'react';
import { Image } from 'expo-image';
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
import { agentGlyph, pathData, type GlyphShape } from '../design/agentGlyph';
import { Placeholder } from './States';
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
  /**
   * Whose face this is — the agent's name. With `face`, the eyes, mouth and marks are generated
   * from it by `agentGlyph`, so every agent is recognisably itself and the same name draws the
   * same face everywhere. Without it, the face is §5's one design.
   */
  identity?: string;
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

/**
 * One shape of a generated face, scaled from the glyph's 100-unit box to the orb.
 *
 * The glyph names two tones rather than colours, and they resolve here to tokens: white for the
 * face, black at low opacity for marks set into the sphere.
 */
function GlyphPart({ shape, unit }: { shape: GlyphShape; unit: number }) {
  const paint = shape.tone === 'ink' ? colors.ink : colors.bg;
  switch (shape.kind) {
    case 'rect':
      return (
        <Rect
          x={shape.x * unit}
          y={shape.y * unit}
          width={shape.w * unit}
          height={shape.h * unit}
          rx={shape.r * unit}
          fill={paint}
          opacity={shape.opacity}
        />
      );
    case 'circle':
      return (
        <Circle
          cx={shape.cx * unit}
          cy={shape.cy * unit}
          r={shape.r * unit}
          fill={paint}
          opacity={shape.opacity}
        />
      );
    case 'fill':
      return <Path d={pathData(shape.d, unit)} fill={paint} opacity={shape.opacity} />;
    case 'stroke':
      return (
        <Path
          d={pathData(shape.d, unit)}
          fill="none"
          stroke={paint}
          strokeWidth={shape.width * unit}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={shape.opacity}
        />
      );
  }
}

export function AgentOrb({
  gradient,
  size = 70,
  bloom = false,
  specular = true,
  face = false,
  identity,
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

  const glyph = React.useMemo(
    () => (face && identity !== undefined ? agentGlyph(identity) : undefined),
    [face, identity],
  );
  const unit = size / 100;

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

        {/* Marks sit under the specular, so the highlight stays the brightest thing on the sphere. */}
        {glyph?.marks.map((shape, i) => <GlyphPart key={`mark-${i}`} shape={shape} unit={unit} />)}

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

        {glyph
          ? glyph.face.map((shape, i) => <GlyphPart key={`face-${i}`} shape={shape} unit={unit} />)
          : face && (
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
  uri,
  pending = false,
  style,
  testID,
}: {
  gradient: Gradient;
  size?: number;
  /**
   * The asset's real logo, from `/market/logos`. Null keeps the gradient.
   *
   * The gradient is not a placeholder to be ashamed of — it is the honest mark for an instrument
   * with no issuer and no token, which is every commodity, index and pre-IPO name in the list. It
   * also renders underneath while the image loads, so a row never flashes empty.
   */
  uri?: string | null;
  /**
   * The lookup is still in flight.
   *
   * Without this the mark had two states for three facts, and the gradient carried two of them:
   * "this instrument has no logo" and "the logo has not arrived". They look identical and mean
   * opposite things — one is final, one resolves a moment later — so a Markets list mid-load was
   * indistinguishable from one where every issuer had declined to have a mark. Same conflation the
   * dashes had, and the same fix: say which.
   */
  pending?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `mark-g-${uid}`;
  // A logo that 404s or is malformed falls back to the gradient rather than leaving a hole.
  const [failed, setFailed] = React.useState(false);
  const showLogo = !!uri && !failed;

  // Nothing is known yet, so nothing is claimed: a pulsing disc rather than an identity.
  if (pending && !showLogo) {
    return (
      <Placeholder
        height={size}
        width={size}
        style={[{ borderRadius: size / 2 }, style]}
        testID={testID}
      />
    );
  }

  return (
    <View testID={testID} style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={gradientId} cx={GRADIENT_CX} cy={GRADIENT_CY} r={GRADIENT_R}>
            <Stop offset={0} stopColor={gradient.c1} />
            <Stop offset={GRADIENT_C2_STOP} stopColor={gradient.c2} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
      {showLogo ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          // `contain` rather than `cover`: these are logos with their own padding and a mark
          // cropped to a circle loses the part that identifies it.
          contentFit="contain"
          transition={0}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : null}
    </View>
  );
}
