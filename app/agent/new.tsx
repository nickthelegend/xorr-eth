/**
 * New agent (2026-09-16): make an agent of your own, and give it strategies to run.
 *
 * A name, what it is for in your own words, and which of the four it works like — the persona whose voice it speaks in —
 * with an optional daily limit the executor holds it to on every run. Then the strategies it runs, each one the executor
 * can actually run, and each shown with what it did over the last ninety days of real prices: the executor's own replay,
 * fees and slippage charged, the ones that made money marked as working and listed first. A strategy whose return is not
 * a price path (idle cash to yield) says so rather than showing a number nobody computed.
 *
 * Made on the executor (`POST /agents/custom`), hired as it is made; each chosen strategy is created for it
 * (`POST /strategies` with its `agentId`), and its page opens. A strategy the executor refuses — no permission yet, a
 * daily cap — says why here, with the agent already made, and can be tried again or left for later.
 *
 * Reached from the + on Home's agents, from Messages, and from the roster.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  AgentOrb,
  BackButton,
  Button,
  Eyebrow,
  Fill,
  Placeholder,
  RadioCard,
  Screen,
  SignInPrompt,
  Text,
  border,
  colors,
  radius,
  space,
  typeScale,
} from '@/ui';
import { agentGradient } from '@/design/gradients';
import { CHAT_AGENTS, useMadeAgents } from '@/chat/agents';
import { useSignedOut } from '@/auth/useSignedOut';
import { repos } from '@/data';
import { system } from '@/data/system';
import { errorText } from '@/data/apiError';
import { percent } from '@/format';
import type { Agent, Strategy } from '@/data/types';

const ORB = 84 as const;
const FIELD_H = 48;
const REPLAY_LINE_W = 160;
const REPLAY_LINE_H = 12;
/** The executor's bounds (`server/src/agents/routes.ts`), so nothing typed here is refused for its length there. */
const NAME_MIN = 2;
const NAME_MAX = 24;
const ROLE_MIN = 3;
const ROLE_MAX = 80;
/** What each run of a chosen strategy spends, until it is changed. */
const DEFAULT_EACH_RUN = '25';
/** The window every replay here covers — one window, so the returns can be read against each other. */
const LOOKBACK = '90d' as const;

type Replay = { ret: number; trades: number } | { failed: string };

type Template = {
  key: string;
  title: string;
  what: string;
  /** The executor's replay over real prices; absent for one whose return is not a price path. */
  replay?: () => Promise<{ ret: number; trades: number }>;
  build: (usd: number) => Omit<Strategy, 'id' | 'createdAt'>;
};

/*
 * Only kinds the executor plans and runs (`EXECUTABLE_KINDS`), on the two assets it routes, settles and holds price history
 * for. Grid is left out: a range is drawn against today's price on its own screen, and a range picked for someone here
 * would be a guess.
 */
const TEMPLATES: readonly Template[] = [
  {
    key: 'momentum-weth',
    title: 'ETH breakouts',
    what: 'A 20-day breakout, 8% stop on every entry.',
    replay: () => repos.bot.backtest('momentum-scout', LOOKBACK, 'WETH'),
    build: (usd) => ({
      kind: 'momentum',
      state: 'live',
      label: `ETH breakouts, $${usd} an entry`,
      symbol: 'WETH',
      params: { usdPerEntry: usd, lookbackDays: 20, stopPct: 8 },
      cadence: 'daily',
      nextRunAt: Date.now(),
      dailyAllocationUsd: usd,
    }),
  },
  {
    key: 'momentum-cbbtc',
    title: 'Bitcoin breakouts',
    what: 'A 20-day breakout, 8% stop on every entry.',
    replay: () => repos.bot.backtest('momentum-scout', LOOKBACK, 'CBBTC'),
    build: (usd) => ({
      kind: 'momentum',
      state: 'live',
      label: `Bitcoin breakouts, $${usd} an entry`,
      symbol: 'CBBTC',
      params: { usdPerEntry: usd, lookbackDays: 20, stopPct: 8 },
      cadence: 'daily',
      nextRunAt: Date.now(),
      dailyAllocationUsd: usd,
    }),
  },
  {
    key: 'dca-weth',
    title: 'Weekly ETH buy',
    what: 'The same amount every week.',
    replay: () =>
      system.backtestStrategy({ kind: 'dca', symbol: 'WETH', lookback: LOOKBACK, params: { usd: 50, everyNDays: 7 } }),
    build: (usd) => ({
      kind: 'dca',
      state: 'live',
      label: `$${usd} of WETH, weekly`,
      symbol: 'WETH',
      params: { usd },
      cadence: 'weekly',
      nextRunAt: Date.now(),
      dailyAllocationUsd: usd,
    }),
  },
  {
    key: 'dca-cbbtc',
    title: 'Weekly Bitcoin buy',
    what: 'The same amount every week.',
    replay: () =>
      system.backtestStrategy({ kind: 'dca', symbol: 'CBBTC', lookback: LOOKBACK, params: { usd: 50, everyNDays: 7 } }),
    build: (usd) => ({
      kind: 'dca',
      state: 'live',
      label: `$${usd} of CBBTC, weekly`,
      symbol: 'CBBTC',
      params: { usd },
      cadence: 'weekly',
      nextRunAt: Date.now(),
      dailyAllocationUsd: usd,
    }),
  },
  {
    key: 'yield-usdc',
    title: 'Idle cash to yield',
    what: 'Idle cash at the pool’s published rate.',
    build: (usd) => ({
      kind: 'yield-rotation',
      state: 'live',
      label: 'Idle cash to yield, daily',
      symbol: 'USDC',
      params: { usd, keepCashUsd: 0, minMoveUsd: 25 },
      cadence: 'daily',
      nextRunAt: Date.now(),
      dailyAllocationUsd: usd,
    }),
  },
];

/** Best first once every replay has answered: a return, then what earns a rate, then what lost, then what could not say. */
function score(t: Template, replay: Replay | undefined): number {
  if (!t.replay) return 0;
  if (!replay || 'failed' in replay) return Number.NEGATIVE_INFINITY;
  return replay.ret;
}

export default function NewAgent() {
  const goBack = useGoBack();
  const router = useRouter();
  const signedOut = useSignedOut();
  const addMade = useMadeAgents((s) => s.add);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [style, setStyle] = useState<string>(CHAT_AGENTS[0]!.id);
  const [limit, setLimit] = useState('');
  const [eachRun, setEachRun] = useState(DEFAULT_EACH_RUN);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [replays, setReplays] = useState<Readonly<Record<string, Replay>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** Set once the agent exists, so trying the strategies again does not make it twice. */
  const [made, setMade] = useState<Agent>();

  // One at a time: each is a replay of real history the executor rate-limits, and each lands on its card as it answers.
  useEffect(() => {
    if (signedOut) return;
    let alive = true;
    void (async () => {
      for (const t of TEMPLATES) {
        if (!t.replay) continue;
        let result: Replay;
        try {
          const r = await t.replay();
          result = { ret: r.ret, trades: r.trades };
        } catch (e) {
          result = { failed: errorText(e) };
        }
        if (!alive) return;
        setReplays((all) => ({ ...all, [t.key]: result }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedOut]);

  const shownName = name.trim();
  const limitUsd = limit.trim() === '' ? undefined : Number(limit);
  const limitOk = limitUsd === undefined || (Number.isFinite(limitUsd) && limitUsd > 0);
  const eachRunUsd = Number(eachRun);
  const eachRunOk = chosen.size === 0 || (Number.isFinite(eachRunUsd) && eachRunUsd > 0);
  const ready = shownName.length >= NAME_MIN && role.trim().length >= ROLE_MIN && limitOk && eachRunOk && !busy;
  // Sorted once, when the last replay is in, so a card never moves under a finger that is reaching for it.
  const settled = TEMPLATES.every((t) => !t.replay || replays[t.key]);
  const ordered = settled
    ? [...TEMPLATES].sort((a, b) => score(b, replays[b.key]) - score(a, replays[a.key]))
    : TEMPLATES;

  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openAgent = (agent: Agent) => router.replace({ pathname: '/agent/[id]', params: { id: agent.id } });

  async function make() {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    try {
      let agent = made;
      if (!agent) {
        agent = await repos.bot.createAgent({
          name: shownName,
          role: role.trim(),
          style,
          ...(limitUsd !== undefined ? { riskLimits: { maxUsdPerDay: limitUsd } } : {}),
        });
        addMade(agent);
        setMade(agent);
      }
      // Never more a run than the agent may spend in a day.
      const usd = limitUsd !== undefined ? Math.min(eachRunUsd, limitUsd) : eachRunUsd;
      const refused: string[] = [];
      const added = new Set<string>();
      for (const t of TEMPLATES) {
        if (!chosen.has(t.key)) continue;
        try {
          await repos.strategies.create({ ...t.build(usd), agentId: agent.id });
          added.add(t.key);
        } catch (e) {
          refused.push(`${t.title}: ${errorText(e)}`);
        }
      }
      if (refused.length === 0) {
        openAgent(agent);
        return;
      }
      // What went through is not asked for twice.
      setChosen((prev) => new Set([...prev].filter((k) => !added.has(k))));
      setError(`${agent.name} is made. ${refused.join(' ')}`);
    } catch (e) {
      // The executor's sentence: a name already taken says so, and says what to do.
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
      <BackButton onPress={() => goBack()} />
      <Text variant="screenTitle">New agent</Text>
    </View>
  );

  if (signedOut) {
    return (
      <Screen>
        {header}
        <SignInPrompt text="Sign in to make an agent." />
      </Screen>
    );
  }

  const strategiesWord = chosen.size === 1 ? 'strategy' : 'strategies';

  return (
    <Screen>
      {header}
      <Fill style={{ marginTop: space.s12 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: space.s6, paddingBottom: space.s20, gap: space.s18 }}
        >
          {/* The agent as it will look: its face and colour come from its name, as it is typed. */}
          <View style={{ alignItems: 'center', gap: space.s8 }}>
            <AgentOrb gradient={agentGradient(shownName || 'New agent')} identity={shownName || 'New agent'} size={ORB} face />
            <Text variant="cardTitle" align="center" numberOfLines={1} color={shownName ? colors.ink : colors.ink40}>
              {shownName || 'Your agent'}
            </Text>
          </View>

          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Dip Buyer"
            maxLength={NAME_MAX}
            capitalize="words"
            editable={!made}
          />
          <Field
            label="What it does"
            value={role}
            onChange={setRole}
            placeholder="Buys ETH on red days"
            maxLength={ROLE_MAX}
            capitalize="sentences"
            editable={!made}
          />

          <View style={{ gap: space.s10 }}>
            <Eyebrow small>Works like</Eyebrow>
            {CHAT_AGENTS.map((a) => (
              <RadioCard
                key={a.id}
                title={a.name}
                detail={a.role}
                selected={style === a.id}
                onPress={() => {
                  if (!made) setStyle(a.id);
                }}
              />
            ))}
          </View>

          <View style={{ gap: space.s10 }}>
            <Eyebrow small>Strategies</Eyebrow>
            <Text variant="secondarySm" color={colors.ink55}>
              Pick what it runs. Each was replayed on the last 90 days of real prices, fees included. Nothing here is a
              promise.
            </Text>
            {ordered.map((t) => {
              const replay = replays[t.key];
              const working = !!replay && !('failed' in replay) && replay.ret > 0;
              return (
                <RadioCard
                  key={t.key}
                  title={t.title}
                  detail={t.what}
                  tag={working ? 'Working' : undefined}
                  selected={chosen.has(t.key)}
                  onPress={() => toggle(t.key)}
                >
                  <ReplayLine template={t} replay={replay} />
                </RadioCard>
              );
            })}
          </View>

          {chosen.size > 0 ? (
            <Field
              label="Each run"
              value={eachRun}
              onChange={(v) => setEachRun(v.replace(/[^0-9.]/g, ''))}
              placeholder="$ a run"
              keyboard="decimal-pad"
            />
          ) : null}

          <Field
            label="Daily limit · optional"
            value={limit}
            onChange={(v) => setLimit(v.replace(/[^0-9.]/g, ''))}
            placeholder="$ a day"
            keyboard="decimal-pad"
            editable={!made}
          />

          {error ? (
            <Text variant="secondarySm" color={colors.down}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Fill>

      {made ? (
        <View style={{ gap: space.s8 }}>
          {chosen.size > 0 ? (
            <Button
              label={busy ? 'Adding' : `Add ${chosen.size} ${strategiesWord}`}
              loading={busy}
              disabled={!ready}
              onPress={() => void make()}
            />
          ) : null}
          <Button label={`Open ${made.name}`} variant="ghost" onPress={() => openAgent(made)} />
        </View>
      ) : (
        <Button
          label={busy ? 'Making' : chosen.size > 0 ? `Make agent · ${chosen.size} ${strategiesWord}` : 'Make agent'}
          loading={busy}
          disabled={!ready}
          onPress={() => void make()}
        />
      )}
    </Screen>
  );
}

/** What a strategy did over the window: its return and trades, a skeleton while the replay runs, or why there is none. */
function ReplayLine({ template, replay }: { template: Template; replay: Replay | undefined }) {
  if (!template.replay) {
    return (
      <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
        Earns the pool’s rate · not a price bet
      </Text>
    );
  }
  if (!replay) return <Placeholder width={REPLAY_LINE_W} height={REPLAY_LINE_H} style={{ marginTop: space.s8 }} />;
  if ('failed' in replay) {
    return (
      <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s6 }}>
        Couldn’t replay it right now
      </Text>
    );
  }
  const trades = `${replay.trades} ${replay.trades === 1 ? 'trade' : 'trades'}`;
  return (
    <Text
      variant="secondarySm"
      color={replay.ret > 0 ? colors.up : replay.ret < 0 ? colors.down : colors.ink55}
      style={{ marginTop: space.s6 }}
    >
      {`${percent(replay.ret, { digits: 1, explicitSign: true })} in 90 days · ${trades}`}
    </Text>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  capitalize = 'none',
  keyboard = 'default',
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  capitalize?: 'none' | 'words' | 'sentences';
  keyboard?: 'default' | 'decimal-pad';
  editable?: boolean;
}) {
  return (
    <View style={{ gap: space.s8 }}>
      <Eyebrow small>{label}</Eyebrow>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink35}
        maxLength={maxLength}
        autoCapitalize={capitalize}
        autoCorrect={false}
        keyboardType={keyboard}
        editable={editable}
        accessibilityLabel={label}
        style={[
          typeScale.body,
          border.input,
          {
            height: FIELD_H,
            borderRadius: radius.tile,
            backgroundColor: colors.inputBg,
            paddingHorizontal: space.s14,
            color: editable ? colors.ink : colors.ink55,
          },
        ]}
      />
    </View>
  );
}
