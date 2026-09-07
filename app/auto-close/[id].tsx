/**
 * Screen 6 — Auto Close. screens.md Group B. WHITE SHEET.
 *
 * "Chart region flex:1; min-height:230px — THE CHART TAKES THE LEFTOVER HEIGHT, NOT A
 * SPACER." TP wash from the top, SL wash from the bottom, candles on the WIDE projection,
 * a mark chip, and TP/SL marker rows at their projected prices. Two control blocks
 * (stepper with a coloured value chip, then a ruler), gap 26. Cancel / Set.
 *
 * "Set" used to call `goBack()` and nothing else — the screen that exists to arm a stop
 * did not arm one, and the numbers lived in app state only, so the "stop" vanished when the
 * phone slept. It now creates a real **`exit-rules` strategy**, which is the executor's own
 * tier-3 mechanism: `planExitRules` reads `entryPrice`, `takeProfitPct`, `stopLossPct` and
 * `trailPct` from its params on every scheduler tick, maintains the trailing high-water mark
 * on the runs where nothing fires, and can only ever CLOSE. That is what makes screen 20's
 * promise ("stops and take-profits stay active") literally true.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  ButtonRow,
  Candlestick,
  EmptyState,
  Fill,
  IconButton,
  LoadingRows,
  NoteStrip,
  Ruler,
  Screen,
  Stepper,
  Tag,
  Text,
  colors,
  money,
  percent,
  price as fmtPrice,
  radius,
  size,
  space,
  toCandles,
  toPct,
  wideProjection,
} from '@/ui';
import {
  lastClose,
  slPnl,
  slPrice,
  slTickPct,
  tpPnl,
  tpPrice,
  tpTickPct,
} from '@/state/derived';
import { useStore } from '@/state/store';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';

/** screens.md: the chart region never goes below this, and takes every spare point above it. */
const CHART_MIN = 230;
/** Half a marker chip, so the row centres on its price rather than hanging under it. */
const MARKER_OFFSET = 11;

/**
 * Trailing-stop bounds.
 *
 * The ceiling is 25% because beyond that the stop stops being a stop — it sits below almost any
 * drawdown and the position is effectively unprotected while looking protected. Half-percent steps
 * match the fixed controls above so the three read as one set of dials.
 */
const TRAIL_STEP = 0.5;
const TRAIL_MAX = 25;

export default function AutoClose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();

  // TP/SL are set against the position's OWN market, on live candles. The handoff's static
  // BTC series meant a user editing a stop on an ETH position was reading a BTC chart.
  const position = useAsync(() => repos.portfolio.position(id!), [id]);
  const symbol = position.data?.symbol ?? 'BTC';
  const candles = useAsync(() => repos.markets.candles(symbol, '1H'), [symbol]);
  // `[o,h,l,c]` on the wire, named fields in the chart set. Memoised off `candles.data`
  // rather than off a `?? []` default, which is a fresh array on every render.
  const bars = candles.data?.bars;
  const series = useMemo(() => toCandles(bars ?? []), [bars]);

  const tp = useStore((s) => s.tp);
  const sl = useStore((s) => s.sl);
  const bumpTp = useStore((s) => s.bumpTp);
  const bumpSl = useStore((s) => s.bumpSl);
  const setTp = useStore((s) => s.setTp);
  const setSl = useStore((s) => s.setSl);

  /*
   * The trailing stop, which the executor has always been able to run.
   *
   * `planExitRules` reads `trailPct`, `observationFor` maintains the high-water mark on every tick
   * — including the runs where nothing fires, which is most of them and exactly when trailing has
   * to happen — and both are covered by tests. Nothing in the app could ever set it, so the one
   * exit people actually ask for existed in full and was unreachable.
   *
   * Off by default and off is a real value: a trailing stop is not strictly better than a fixed
   * one, and turning it on for everybody would change what existing positions do.
   */
  const [trail, setTrail] = useState(0);

  const [chartH, setChartH] = useState(CHART_MIN);
  const [rulerW, setRulerW] = useState(300);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  // Show what is already armed rather than the app's last local guess. An exit rule is a
  // live strategy of kind `exit-rules` on this symbol.
  const strategies = useAsync(() => repos.strategies.list(), []);
  const armed = (strategies.data ?? []).find(
    (st) => st.kind === 'exit-rules' && st.symbol === symbol && st.state === 'live',
  );
  const armedParams = (armed?.params ?? {}) as {
    takeProfitPct?: number;
    stopLossPct?: number;
    trailPct?: number;
  };
  const armedTrail = armedParams.trailPct;
  const armedTp = armedParams.takeProfitPct;
  const armedSl = armedParams.stopLossPct == null ? undefined : -Math.abs(armedParams.stopLossPct);

  useEffect(() => {
    if (armedTp !== undefined && Number.isFinite(armedTp)) setTp(armedTp);
    if (armedSl !== undefined && Number.isFinite(armedSl)) setSl(armedSl);
    if (armedTrail !== undefined && Number.isFinite(armedTrail)) setTrail(armedTrail);
  }, [armedTp, armedSl, armedTrail, setTp, setSl]);

  /**
   * The steppers edit inside state.md's manual range (TP 0.5–3.0, SL −3.0 to −0.5). A rule
   * the ENTRY agent armed is derived from its own proposed stop and target, so it can sit
   * outside that range — and `setTp`/`setSl` clamp it on the way in.
   *
   * Which means the steppers can show a number that is not the rule that is running. That
   * is exactly the kind of quiet misstatement this screen must not make, so when the two
   * disagree the armed rule is stated in full, and the CTA says it will replace it.
   */
  const clamped =
    (armedTp !== undefined && Math.abs(armedTp - tp) > 0.001) ||
    (armedSl !== undefined && Math.abs(armedSl - sl) > 0.001);

  // Everything is anchored to the live mark, not to the handoff's mid of 66,000.
  const mark = bars && bars.length ? lastClose(bars) : 0;
  const tpP = tpPrice(tp, mark);
  const slP = slPrice(sl, mark);
  // The WIDE projection — its bounds follow TP/SL so both markers stay in frame.
  const proj = series.length ? wideProjection(series, tpP, slP) : null;
  // Size the P&L off the real position, not a fixed $2,500 notional.
  const notional = position.data?.notional ?? 0;

  async function save() {
    if (!id) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      if (armed) await repos.strategies.end(armed.id);
      await repos.strategies.create({
        kind: 'exit-rules',
        state: 'live',
        label: `Exit ${symbol} at ${percent(tp)} / ${percent(sl)}`,
        symbol,
        // `planExitRules` sizes itself by looking at the holding, so it commits no daily
        // allowance — a stop that ate into the cap would be a stop the cap could silence.
        params: {
          entryPrice: position.data?.entry ?? mark,
          takeProfitPct: tp,
          stopLossPct: Math.abs(sl),
          /*
           * Omitted entirely when off, rather than sent as 0.
           *
           * `planExitRules` treats `trailPct > 0` as "configured", so a zero is already inert —
           * but a param that is present and meaningless is the kind of thing a later reader
           * trusts. Absent says what it means.
           */
          ...(trail > 0 ? { trailPct: trail, peakPrice: mark } : {}),
        },
        cadence: 'daily',
        dailyAllocationUsd: 0,
      });
      goBack();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="sheetTitle" color={colors.sheet.ink}>
        Auto Close
      </Text>
      <IconButton
        name="close"
        accessibilityLabel="Close"
        onPress={() => goBack()}
        background="none"
        color={colors.sheet.ink}
        glyph={20}
      />
    </View>
  );

  /*
   * No position, no stop to arm.
   *
   * The screen rendered its whole ticket for an id that resolves to nothing: `symbol` fell back
   * to `'BTC'` and `notional` to 0, so it drew a live BTC chart with working steppers and an
   * enabled Set — and Set creates a real `exit-rules` strategy. Arming a stop on a holding the
   * user does not have, from a screen reached by a stale link, a closed position or a mistyped
   * URL. `/position/:id` already answers this correctly; this one is reached the same ways.
   *
   * Waiting on the fetch is not the same as knowing there is nothing, so only a settled query
   * with no row says so.
   */
  if (!position.loading && !position.data) {
    return (
      <Screen light gutter="sheet">
        {header}
        <EmptyState text="This position is no longer open, so there is no stop to set on it." />
      </Screen>
    );
  }

  return (
    <Screen light gutter="sheet">
      {header}

      {/* THE LAYOUT LAW: flex:1 goes to the chart, never to a spacer. */}
      <Fill style={{ minHeight: CHART_MIN, marginTop: space.s18 }}>
        {!series.length ? (
          candles.loading || position.loading ? (
            <LoadingRows count={3} height={size.row} />
          ) : (
            <EmptyState text={`No live ${symbol} series, so there is nothing to set against.`} />
          )
        ) : (
          <View
            style={{ flex: 1, position: 'relative' }}
            onLayout={(e: LayoutChangeEvent) => setChartH(e.nativeEvent.layout.height)}
          >
            {/* TP wash from the top down to TP. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: `${toPct(proj!, tpP)}%`,
                backgroundColor: colors.tpZone,
              }}
            />
            {/* SL wash from SL down to the bottom. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: `${100 - toPct(proj!, slP)}%`,
                backgroundColor: colors.slZone,
              }}
            />
            <Candlestick
              series={series}
              projection={proj!}
              height={chartH}
              light
              lastPrice={{ value: mark, label: fmtPrice(mark) }}
              lastPriceSide="left"
            />

            <MarkerRow
              topPct={toPct(proj!, tpP)}
              height={chartH}
              label="Take Profit"
              price={fmtPrice(tpP)}
              color={colors.candleUp}
            />
            <MarkerRow
              topPct={toPct(proj!, slP)}
              height={chartH}
              label="Stop Loss"
              price={fmtPrice(slP)}
              color={colors.candleDown}
            />
          </View>
        )}
      </Fill>

      <View
        style={{ gap: space.s26, marginTop: space.s20 }}
        onLayout={(e) => setRulerW(e.nativeEvent.layout.width)}
      >
        <ControlBlock
          label="Take Profit"
          value={percent(tp)}
          tone="tp"
          chipColor={colors.candleUp}
          onDec={() => bumpTp(-1)}
          onInc={() => bumpTp(1)}
          tickPct={tpTickPct(tp)}
          rulerW={rulerW}
        />
        <ControlBlock
          label="Stop Loss"
          value={percent(sl)}
          tone="sl"
          chipColor={colors.candleDown}
          onDec={() => bumpSl(-1)}
          onInc={() => bumpSl(1)}
          tickPct={slTickPct(sl)}
          rulerW={rulerW}
        />
        <ControlBlock
          label="Trailing Stop"
          value={trail > 0 ? `${trail.toFixed(1)}% below the high` : 'Off'}
          tone="sl"
          chipColor={trail > 0 ? colors.candleDown : colors.ink35}
          onDec={() => setTrail((t) => Math.max(0, Math.round((t - TRAIL_STEP) * 10) / 10))}
          onInc={() => setTrail((t) => Math.min(TRAIL_MAX, Math.round((t + TRAIL_STEP) * 10) / 10))}
          tickPct={(trail / TRAIL_MAX) * 100}
          rulerW={rulerW}
        />
      </View>

      {trail > 0 ? (
        <NoteStrip kind="acted" style={{ marginTop: space.s16 }}>
          {`Follows ${symbol} up and never down. It sells if the price falls ${trail.toFixed(1)}% from the highest point reached after this is set — ${fmtPrice(mark * (1 - trail / 100))} if the high stays where it is now.`}
        </NoteStrip>
      ) : null}

      {clamped ? (
        <NoteStrip kind="risk" style={{ marginTop: space.s16 }}>
          {`An agent armed this position at ${armedTp !== undefined ? percent(armedTp) : 'no take profit'} / ${armedSl !== undefined ? percent(armedSl) : 'no stop'}, which is outside the range you can set by hand. Setting yours replaces it.`}
        </NoteStrip>
      ) : null}

      {saveError ? (
        <Text
          variant="footnote"
          color={colors.candleDown}
          align="center"
          style={{ marginTop: space.s12 }}
        >
          {saveError}
        </Text>
      ) : null}

      <ButtonRow
        style={{ marginTop: space.s22 }}
        secondary={
          <Button
            label="Cancel"
            backgroundColor={colors.cancelBg}
            color={colors.cancelInk}
            onPress={() => goBack()}
          />
        }
        primary={
          <Button
            label={clamped ? 'Replace' : 'Set'}
            backgroundColor={colors.candleUp}
            color={colors.ink}
            loading={saving}
            onPress={save}
          />
        }
      />

      <Text
        variant="footnote"
        color={colors.sheet.dim}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        Make{' '}
        <Text variant="footnote" color={colors.candleUp}>
          {money(tpPnl(tp, notional))}
        </Text>{' '}
        at TP or lose{' '}
        <Text variant="footnote" color={colors.candleDown}>
          {money(slPnl(sl, notional))}
        </Text>{' '}
        at SL
      </Text>
    </Screen>
  );
}

/** A label chip on the left and its price on the right, both centred on the marker's price. */
function MarkerRow({
  topPct,
  height,
  label,
  price,
  color,
}: {
  topPct: number;
  height: number;
  label: string;
  price: string;
  color: string;
}) {
  const chip = { bg: color, fg: colors.ink };
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: (topPct / 100) * height - MARKER_OFFSET,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Tag label={label} small sentence colors={chip} radius={radius.tile} />
      <Tag label={price} small sentence colors={chip} radius={radius.tile} />
    </View>
  );
}

function ControlBlock({
  label,
  value,
  tone,
  chipColor,
  onDec,
  onInc,
  tickPct,
  rulerW,
}: {
  label: string;
  value: string;
  tone: 'tp' | 'sl';
  chipColor: string;
  onDec: () => void;
  onInc: () => void;
  tickPct: number;
  rulerW: number;
}) {
  return (
    <View style={{ gap: space.s10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="rowPrimary" color={colors.sheet.ink}>
          {label}
        </Text>
        <Stepper
          value={value}
          onDecrement={onDec}
          onIncrement={onInc}
          light
          chip={{ bg: chipColor, fg: colors.ink }}
          valueMinWidth={72}
        />
      </View>
      {/* `tickPct` is state.md's 0–100 derivation; `Ruler` takes 0–1. */}
      <Ruler position={tickPct / 100} tone={tone} style={{ width: rulerW }} />
    </View>
  );
}
