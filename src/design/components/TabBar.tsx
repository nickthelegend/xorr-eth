/**
 * Bottom tab bar — design.md §4.
 *
 * 5 destinations, flex:1 each, padding 8 8 22, top edge hairlineStrong.
 * Per tab: 21x21 icon over a 9.5/600 label, gap 5. Active #fff, inactive ink30, applied to icon
 * and label together.
 *
 * PLAN.md §3.5 repurposes two slots the handoff left undesigned:
 *   Home · Markets · BOT (centre) · Strategies · Assets
 *
 * The centre tab carries a 6px status dot at top:-1 right:-3 — design.md calls it "the only
 * always-visible signal that something is trading on the user's behalf". `up` when the delegation
 * is live, ink30 when revoked. STATIC — animations.md: "no pulse. A pulsing dot on a bottom tab
 * is a distraction the user can't dismiss."
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borders, ink, pnl } from '../colors';
import { Icon, type IconName } from '../Icon';
import { hairlineWidth } from '../space';
import { type } from '../type';

export type TabDef = { key: string; label: string; icon: IconName; badge?: boolean };

export const TABS: TabDef[] = [
  { key: 'index', label: 'Home', icon: 'home' },
  { key: 'markets', label: 'Markets', icon: 'markets' },
  { key: 'bot', label: 'Bot', icon: 'bot', badge: true },
  { key: 'strategies', label: 'Strategies', icon: 'strategies' },
  // Route is /holdings, not /assets: Metro reserves /assets for its own asset server on web,
  // so the route collided with the bundler and the tab 404'd in a browser. The LABEL is
  // unchanged — design.md §4 names this tab Assets.
  { key: 'holdings', label: 'Assets', icon: 'assets' },
];

export function TabBar({
  active,
  onSelect,
  /** Drives the Bot-tab status dot. False when the kill switch has revoked the delegation. */
  live,
}: {
  active: string;
  onSelect: (key: string) => void;
  live: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingTop: 8,
        paddingHorizontal: 8,
        paddingBottom: Math.max(22, insets.bottom),
        borderTopWidth: hairlineWidth,
        borderTopColor: borders.hairlineStrong,
        backgroundColor: '#000000',
      }}
    >
      {TABS.map((t) => {
        const on = t.key === active;
        // design.md: "applied to icon and label together via currentColor".
        const color = on ? ink.full : ink.i30;
        return (
          <Pressable
            key={t.key}
            onPress={() => onSelect(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              t.badge ? `${t.label}, agents ${live ? 'live' : 'stopped'}` : t.label
            }
            style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 8 }}
          >
            <View style={{ width: 21, height: 21 }}>
              <Icon name={t.icon} size={21} color={color} />
              {t.badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -3,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: live ? pnl.up : ink.i30,
                  }}
                />
              ) : null}
            </View>
            <Text style={[type.tabLabel, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
