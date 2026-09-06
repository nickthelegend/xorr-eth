/**
 * TabBar.tsx — the 5-destination bottom bar.
 *
 * design.md §4:
 *   5 destinations, flex:1 each · padding 8px 8px 22px · top edge hairlineStrong
 *   per tab: 21×21 inline SVG (viewBox 0 0 24 24, stroke-width 1.8, round cap+join,
 *   no fill) over a 9.5/600 label, gap 5
 *   active #fff, inactive rgba(255,255,255,.3) — icon and label together, via currentColor
 *
 * The paths below are §4 verbatim. They are drawn, not from an icon set, and the optical
 * weight is the 1.8 stroke — swapping in another set means matching that, not the size.
 *
 * **Agents carries a 6px status dot** at top −1 right −3: `up` when agents are live,
 * `ink30` when stopped. It is the only always-visible signal that something is trading on
 * the user's behalf, so it is wired to the kill switch, not to which tab is selected.
 * animations.md: the dot never pulses — a pulsing dot on a bottom tab is a distraction the
 * user can't dismiss.
 *
 * Agents sits centre because agent supervision, not order entry, is what distinguishes
 * this app.
 *
 * The 22px bottom padding is replaced by the real bottom inset, floored at 22 so a device
 * that reports none still gets the design's spacing.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Press } from './Press';
import { Text } from './Text';
import { colors, size, space } from './tokens';

export type TabKey = 'home' | 'markets' | 'agents' | 'trade' | 'assets';

export const TAB_ORDER: readonly TabKey[] = ['home', 'markets', 'agents', 'trade', 'assets'];

const TAB_LABEL: Readonly<Record<TabKey, string>> = {
  home: 'Home',
  markets: 'Markets',
  agents: 'Agents',
  trade: 'Trade',
  assets: 'Assets',
};

const STROKE = {
  fill: 'none',
  strokeWidth: size.tabIconStroke,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function TabIcon({ tab, color }: { tab: TabKey; color: string }) {
  const common = { width: size.tabIcon, height: size.tabIcon, viewBox: '0 0 24 24' };

  switch (tab) {
    case 'home':
      return (
        <Svg {...common}>
          <Path
            d="M3 10.5 L12 3.5 L21 10.5 V20 a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"
            stroke={color}
            {...STROKE}
          />
          <Path d="M9.5 21v-6h5v6" stroke={color} {...STROKE} />
        </Svg>
      );
    case 'markets':
      return (
        <Svg {...common}>
          <Path d="M4 4v16h16" stroke={color} {...STROKE} />
          <Path d="M7.5 15.5 L11 11 L14 13.5 L19.5 7" stroke={color} {...STROKE} />
        </Svg>
      );
    case 'agents':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={8.5} stroke={color} {...STROKE} />
          <Circle cx={9.3} cy={10.4} r={1.15} fill={color} />
          <Circle cx={14.7} cy={10.4} r={1.15} fill={color} />
          <Path d="M9.4 15.2a3.6 3.6 0 0 0 5.2 0" stroke={color} {...STROKE} />
        </Svg>
      );
    case 'trade':
      return (
        <Svg {...common}>
          <Path d="M7 4v16" stroke={color} {...STROKE} />
          <Path d="M4 7.5 L7 4 L10 7.5" stroke={color} {...STROKE} />
          <Path d="M17 20V4" stroke={color} {...STROKE} />
          <Path d="M20 16.5 L17 20 L14 16.5" stroke={color} {...STROKE} />
        </Svg>
      );
    case 'assets':
      return (
        <Svg {...common}>
          <Rect x={3} y={6.5} width={18} height={13} rx={2.5} stroke={color} {...STROKE} />
          <Path d="M3 10.5h18" stroke={color} {...STROKE} />
          <Path d="M16.5 15h2" stroke={color} {...STROKE} />
        </Svg>
      );
  }
}

export interface TabBarProps {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  /**
   * Whether any agent can place an order right now — the kill-switch state. Drives the
   * dot on the Agents tab, and nothing else.
   */
  agentsLive: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BAR_PADDING_TOP = space.s8;
const BAR_PADDING_X = space.s8;
const BAR_PADDING_BOTTOM = space.s22;
const TAB_PADDING_V = space.s8;
const DOT_TOP = -1;
const DOT_RIGHT = -3;

export function TabBar({ active, onSelect, agentsLive, style, testID }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          paddingTop: BAR_PADDING_TOP,
          paddingHorizontal: BAR_PADDING_X,
          paddingBottom: Math.max(insets.bottom, BAR_PADDING_BOTTOM),
          borderTopWidth: 1,
          borderTopColor: colors.hairlineStrong,
        },
        style,
      ]}
    >
      {TAB_ORDER.map((tab) => {
        const selected = tab === active;
        /* Selection is white-on-dark. The green here is the *status dot*, which reports
           whether agents are trading — it is not what says this tab is open. */
        const tint = selected ? colors.ink : colors.ink30;

        return (
          <Press
            key={tab}
            onPress={() => onSelect(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={TAB_LABEL[tab]}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: size.tabGap,
              paddingVertical: TAB_PADDING_V,
            }}
          >
            <View style={{ width: size.tabIcon, height: size.tabIcon }}>
              <TabIcon tab={tab} color={tint} />
              {tab === 'agents' && (
                <View
                  style={{
                    position: 'absolute',
                    top: DOT_TOP,
                    right: DOT_RIGHT,
                    width: size.tabDot,
                    height: size.tabDot,
                    borderRadius: size.tabDot / 2,
                    backgroundColor: agentsLive ? colors.up : colors.ink30,
                  }}
                />
              )}
            </View>
            <Text variant="tabLabel" color={tint}>
              {TAB_LABEL[tab]}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
