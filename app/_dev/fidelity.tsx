/**
 * The fidelity harness — PLAN.md 2.8 / §3.9.
 *
 * Renders any route at a LOCKED 402 x 874 — the exact canvas the handoff was authored on — with a
 * token overlay, so fidelity is diffed rather than eyeballed. This is the screen PLAN.md 13.1 uses
 * for the screen-by-screen pass and the one store screenshots come from.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/design/responsive';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { GUTTER, SCREEN_TOP, hairlineWidth, radius } from '@/design/space';
import { DURATION } from '@/design/motion';
import { type } from '@/design/type';
import { Button, Screen, ScreenHeader } from '@/design/components';

/** Every route worth checking against the reference, in the handoff's own numbering. */
const SCREENS: { n: string; label: string; route: string }[] = [
  { n: '1', label: 'Splash', route: '/(onboarding)' },
  { n: '2', label: 'Wallet home', route: '/(tabs)' },
  { n: '3', label: 'Agent intro', route: '/bot/momentum-scout/intro' },
  { n: '4', label: 'Trade settings', route: '/bot/momentum-scout/settings' },
  { n: '5', label: 'Watchlist', route: '/watchlist' },
  { n: '6', label: 'Auto Close', route: '/auto-close/current' },
  { n: '7', label: 'Goals & risk', route: '/goals' },
  { n: '8→', label: 'Wallet setup', route: '/wallet' },
  { n: '9→', label: 'Fund', route: '/fund' },
  { n: '—', label: 'Grant delegation', route: '/delegate' },
  { n: '10', label: 'Portfolio proposal', route: '/proposal' },
  { n: '11', label: 'Agent roster', route: '/bot/roster' },
  { n: '12', label: 'Bot chat', route: '/bot' },
  { n: '13', label: 'Asset detail', route: '/asset/SOL' },
  { n: '14', label: 'Order ticket', route: '/order/SOL' },
  { n: '15', label: 'Activity', route: '/activity' },
  { n: '16', label: 'Leaderboard', route: '/bot/leaderboard' },
  { n: '17', label: 'Backtest', route: '/bot/momentum-scout/backtest' },
  { n: '18', label: 'Alerts', route: '/alerts' },
  { n: '19', label: 'Swap', route: '/swap' },
  { n: '20', label: 'Kill switch', route: '/safety' },
  { n: '21', label: 'Pro chart', route: '/chart/BTC' },
  { n: '22', label: 'Position', route: '/position/current' },
  { n: '23', label: 'Briefing', route: '/briefing' },
  { n: '24', label: 'Markets', route: '/markets' },
  { n: '25', label: 'Perp contract', route: '/perp/XAUT' },
  { n: '—', label: 'Strategies (new)', route: '/strategies' },
  { n: '—', label: 'Assets (new)', route: '/holdings' },
  { n: '—', label: 'DCA setup (new)', route: '/strategy/dca' },
];

export default function Fidelity() {
  const router = useRouter();
  const [overlay, setOverlay] = useState(true);

  return (
    <Screen>
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Fidelity</Text>}
        right={
          <Button
            label={overlay ? 'Hide grid' : 'Show grid'}
            variant="ghost"
            height={34}
            onPress={() => setOverlay((o) => !o)}
          />
        }
      />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Design canvas {DESIGN_WIDTH} × {DESIGN_HEIGHT}. Open a screen and compare it against
        ui/mobile-ui/reference/.
      </Text>

      <Screen.Content style={{ marginTop: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {overlay ? <TokenOverlay /> : null}

          <Text style={[type.eyebrowSm, { color: ink.i32, marginTop: 20, marginBottom: 8 }]}>
            Screens
          </Text>
          {SCREENS.map((s) => (
            <Pressable
              key={s.route + s.label}
              accessibilityRole="button"
              accessibilityLabel={`Open ${s.label}`}
              onPress={() => router.push(s.route as never)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                height: 48,
                borderBottomWidth: hairlineWidth,
                borderBottomColor: borders.hairline,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={[type.footnote, { color: ink.i32, width: 26 }]}>{s.n}</Text>
              <Text style={[type.rowPrimary, { color: ink.full, flex: 1 }]}>{s.label}</Text>
              <Text style={[type.footnote, { color: ink.i28 }]}>{s.route}</Text>
            </Pressable>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}

/** The values design.md fixes, on screen, so a drift is visible rather than argued about. */
function TokenOverlay() {
  return (
    <View
      style={{
        backgroundColor: surfaces.surface,
        borderRadius: radius.xl,
        padding: 16,
        gap: 12,
      }}
    >
      <Text style={[type.eyebrowSm, { color: ink.i32 }]}>Tokens in play</Text>
      <Row label="Gutter" value={`${GUTTER}px`} />
      <Row label="Top padding" value={`${SCREEN_TOP}px`} />
      <Row label="Hairline" value={`${hairlineWidth.toFixed(3)}px @ ${borders.hairline}`} />
      <Row label="Durations" value={Object.values(DURATION).join(' / ')} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {[
          ['bg', surfaces.bg],
          ['surface', surfaces.surface],
          ['control', surfaces.control],
          ['up', pnl.up],
          ['down', pnl.down],
          ['warn', pnl.warn],
        ].map(([name, color]) => (
          <View key={name} style={{ alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: radius.xs2,
                backgroundColor: color,
                borderWidth: hairlineWidth,
                borderColor: borders.card,
              }}
            />
            <Text style={[type.footnoteSm, { color: ink.i28 }]}>{name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.secondary, { color: ink.i40 }]}>{label}</Text>
      <Text style={[type.secondary, { color: ink.full }]}>{value}</Text>
    </View>
  );
}
