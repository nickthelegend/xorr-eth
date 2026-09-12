/**
 * TabBar.tsx — the three-button bar.
 *
 * Rebuilt 2026-09-12 to the product owner's reference: Home on the left, a solid circle in the
 * middle, and a grid on the right. No labels — three glyphs this distinct do not need them, and
 * five icons with words under them was the clutter this replaces.
 *
 * The middle button is the AI chat. It is an ACTION, not a place: it raises the conversation over
 * whatever is on screen, so it never lights up. Home and the grid are the two places: lit is white,
 * unlit is ink30. The chat circle is solid white with a dark glyph — the brightest thing on the bar,
 * because it is the thing you reach for.
 *
 * The glyphs are drawn here rather than taken from the icon set, as the old bar's were: they are
 * solid where the set is stroked, because a filled shape is what makes three buttons read at a
 * glance.
 *
 * The bottom padding is the real inset, floored so a device that reports none still clears the edge.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Press } from './Press';
import { colors, space } from './tokens';

export type TabKey = 'home' | 'more';

/** The two places, left to right. The action sits between them. */
export const TAB_ORDER: readonly TabKey[] = ['home', 'more'];

const TAB_LABEL: Readonly<Record<TabKey, string>> = {
  home: 'Home',
  more: 'More',
};

/** The tab glyph box, and the centre circle's diameter — which is also every slot's height. */
const GLYPH = 26;
const ACTION = 54;
const ACTION_GLYPH = 24;
const ACTION_STROKE = 2.2;

/** The house, solid, with its door cut out. */
function HomeGlyph({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24">
      <Path
        d="M3 10.5 L12 3.5 L21 10.5 V20 a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M9.75 21v-5.25h4.5V21Z"
        fill={color}
        fillRule="evenodd"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Four rounded squares — "everything else". */
function GridGlyph({ color }: { color: string }) {
  const cells = [
    [3.5, 3.5],
    [13.5, 3.5],
    [3.5, 13.5],
    [13.5, 13.5],
  ] as const;
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24">
      {cells.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={7} rx={2.2} fill={color} />
      ))}
    </Svg>
  );
}

/**
 * The chat bubble in the centre circle, with the agent's face in it.
 *
 * The two dots and the smile are the same face the roster and the proposal cards draw: it is the
 * bot you are talking to, not a support inbox.
 */
function ChatGlyph({ color }: { color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: ACTION_STROKE,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
  return (
    <Svg width={ACTION_GLYPH} height={ACTION_GLYPH} viewBox="0 0 24 24">
      <Path
        d="M21 11.5c0 4.14-4.03 7.5-9 7.5a10.5 10.5 0 0 1-2.6-.32L4.5 20.5l1.2-3.2A7.02 7.02 0 0 1 3 11.5C3 7.36 7.03 4 12 4s9 3.36 9 7.5Z"
        {...stroke}
      />
      <Circle cx={9.2} cy={11.2} r={1.2} fill={color} />
      <Circle cx={14.8} cy={11.2} r={1.2} fill={color} />
      <Path d="M9.3 14.2a3.4 3.4 0 0 0 5.4 0" {...stroke} />
    </Svg>
  );
}

export interface TabBarProps {
  /**
   * The open place, or null when the screen is neither.
   *
   * A route inside the tab group that is not one of the two — Markets, say, opened from the grid —
   * lights the grid, because that is where it lives now. The layout decides; the bar just draws it.
   */
  active: TabKey | null;
  onSelect: (tab: TabKey) => void;
  /** The centre action — opens the AI chat. Not a place, so it takes no `active`. */
  onAction: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TabBar({ active, onSelect, onAction, style, testID }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const place = (tab: TabKey) => {
    const selected = tab === active;
    const tint = selected ? colors.ink : colors.ink30;
    return (
      <Press
        key={tab}
        onPress={() => onSelect(tab)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        /*
         * `aria-selected` IS valid on `role="tab"` — and React Native Web still does not emit it,
         * so the bar announced its tabs with no current one. Added explicitly.
         */
        aria-selected={selected}
        accessibilityLabel={TAB_LABEL[tab]}
        hitHeight={ACTION}
        style={{ flex: 1, height: ACTION, alignItems: 'center', justifyContent: 'center' }}
      >
        {tab === 'home' ? <HomeGlyph color={tint} /> : <GridGlyph color={tint} />}
      </Press>
    );
  };

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: space.s8,
          paddingHorizontal: space.s30,
          paddingBottom: Math.max(insets.bottom, space.s16),
          backgroundColor: colors.bg,
        },
        style,
      ]}
    >
      {place('home')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Press
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel="Chat with your agent"
          hitHeight={ACTION}
          hitWidth={ACTION}
          style={{
            width: ACTION,
            height: ACTION,
            borderRadius: ACTION / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.ink,
          }}
        >
          <ChatGlyph color={colors.sheet.ink} />
        </Press>
      </View>
      {place('more')}
    </View>
  );
}
