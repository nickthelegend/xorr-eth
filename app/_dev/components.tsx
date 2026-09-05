/**
 * Component gallery — PLAN.md 1.16. Every primitive, every state, on black.
 * The place to see that a change to one token did not quietly break a neighbour.
 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AgentOrb,
  AgentOrbLabel,
  AssetMark,
  Button,
  ButtonRow,
  ChoiceChip,
  EmptyState,
  IconButton,
  LoadingRows,
  NoteStrip,
  Pill,
  PillRow,
  Progress,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  SheetCard,
  SimulatedTag,
  Stepper,
  Switch,
  SwitchRow,
} from '@/design/components';
import { Candlestick, Ruler, Sparkline, projectCandles, tight } from '@/charts';
import { Icon, type IconName } from '@/design/Icon';
import { ink, pnl } from '@/design/colors';
import { agentGradients } from '@/design/gradients';
import { radius } from '@/design/space';
import { type } from '@/design/type';
import { btcBars, watchlistGroups } from '@/data/fixtures/series';

const ICONS: IconName[] = [
  'home', 'markets', 'bot', 'strategies', 'assets', 'search', 'back', 'gear',
  'star', 'starFilled', 'more', 'close', 'chevron', 'plus', 'minus', 'swap',
  'check', 'send', 'bell', 'sort',
];

export default function Gallery() {
  const [seg, setSeg] = useState(0);
  const [sw, setSw] = useState(true);
  const [chip, setChip] = useState(true);
  const [n, setN] = useState(1600);
  const candles = projectCandles(btcBars, tight(btcBars));

  return (
    <Screen>
      <ScreenHeader left={<Text style={[type.screenTitle, { color: ink.full }]}>Components</Text>} />
      <Screen.Content style={{ marginTop: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 26, paddingBottom: 40 }}>
          <Section title="Buttons">
            <Button label="Primary" />
            <Button label="Destructive" variant="destructive" />
            <Button label="Confirmed" variant="confirmed" />
            <Button label="Secondary" variant="secondary" />
            <Button label="Ghost" variant="ghost" />
            <Button label="Disabled" disabled />
            <Button label="Loading" loading />
            <ButtonRow secondary={<Button label="Skip" variant="secondary" />} affirmative={<Button label="Approve" />} />
          </Section>

          <Section title="Pills & segments">
            <PillRow>
              <Pill label="Selected" selected />
              <Pill label="Unselected" />
              <Pill label="Another" />
            </PillRow>
            <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap' }}>
              <ChoiceChip label="Chosen" selected={chip} onPress={() => setChip(!chip)} />
              <ChoiceChip label="Not chosen" selected={!chip} onPress={() => setChip(!chip)} />
            </View>
            <Segmented options={['P&L', 'Win rate', 'Volume']} value={seg} onChange={setSeg} />
            <Segmented options={['Buy', 'Sell']} value={seg % 2} onChange={setSeg} variant="sheet" />
          </Section>

          <Section title="Controls">
            <Stepper
              value={`$${n.toLocaleString('en-US')}/day`}
              onDecrement={() => setN((v) => Math.max(200, v - 200))}
              onIncrement={() => setN((v) => Math.min(5000, v + 200))}
              valueMinWidth={88}
              accessibilityLabel="Cap"
            />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Switch value={sw} onValueChange={setSw} accessibilityLabel="Default" />
              <Switch value={!sw} onValueChange={() => setSw(!sw)} size="alerts" accessibilityLabel="Alerts size" />
            </View>
            <SwitchRow
              label="Trade Autonomously"
              caption={sw ? 'Executes inside your limits without asking' : 'Every trade waits for your approval'}
              value={sw}
              onValueChange={setSw}
            />
            <Progress step={2} total={3} />
          </Section>

          <Section title="Orbs & marks">
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {([34, 52, 56, 74, 104] as const).map((s) => (
                <AgentOrb key={s} gradient={agentGradients['Momentum Scout']} size={s} face specular />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <View>
                <AgentOrb gradient={agentGradients['Yield Keeper']} size={56} face breathe bloom />
                <AgentOrbLabel name="Yield Keeper" status="Active" />
              </View>
              <View>
                <AgentOrb gradient={agentGradients['Drawdown Guard']} size={56} face />
                <AgentOrbLabel name="Drawdown Guard" status="Paused" />
              </View>
              <View>
                <AgentOrb gradient={agentGradients['Earnings Desk']} size={56} face badge="+$842" />
                <AgentOrbLabel name="Earnings Desk" status="New" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AssetMark gradient={{ c1: '#F7931A', c2: '#B96908' }} />
              <AssetMark gradient={{ c1: '#5B93FF', c2: '#49E39B' }} />
              <AssetMark gradient={{ c1: '#F5CE5F', c2: '#B98A0C' }} />
            </View>
          </Section>

          <Section title="Rows">
            <Row
              mark={<AssetMark gradient={{ c1: '#5B93FF', c2: '#49E39B' }} />}
              primary="SOL"
              secondary="Solana · Spot · Perp"
              value="$102.87"
              delta="+2.40%"
              deltaColor={pnl.up}
            />
            <Row
              mark={<AssetMark gradient={{ c1: '#9AA3AD', c2: '#4A5058' }} />}
              primary="XRP"
              secondary="XRP · Perp · 50x"
              value="$1.42"
              delta="−1.08%"
              deltaColor={pnl.down}
              middle={<SimulatedTag />}
            />
            <Row
              primary="HYPE"
              middle={<Sparkline points={watchlistGroups[0]!.rows[2]!.spark} />}
              value="$85.13"
              delta="+0.90%"
              deltaColor={pnl.up}
            />
          </Section>

          <Section title="Notes & states">
            <NoteStrip kind="acted">The agent acted, and this is what it did.</NoteStrip>
            <NoteStrip kind="risk">The agent adjusted risk.</NoteStrip>
            <NoteStrip kind="blocked">The agent refused, and this is why.</NoteStrip>
            <SheetCard><Text style={[type.body, { color: ink.full }]}>A sheet card.</Text></SheetCard>
            <LoadingRows count={2} />
            <EmptyState text="Nothing here yet." />
          </Section>

          <Section title="Charts">
            <Candlestick candles={candles} height={140} />
            <Ruler markerPct={42} color={pnl.candleUp} width={320} />
          </Section>

          <Section title="Icons">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {ICONS.map((name) => (
                <View key={name} style={{ alignItems: 'center', gap: 4, width: 56 }}>
                  <Icon name={name} size={21} color={ink.full} />
                  <Text style={[type.footnoteSm, { color: ink.i28 }]} numberOfLines={1}>{name}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <IconButton name="search" accessibilityLabel="Search" />
              <IconButton name="sort" accessibilityLabel="Sort" />
              <IconButton name="gear" accessibilityLabel="Settings" />
            </View>
          </Section>
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={[type.eyebrowSm, { color: ink.i32 }]}>{title}</Text>
      <View style={{ gap: 12, borderRadius: radius.md, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
