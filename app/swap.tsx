/**
 * Screen 19 — Swap. screens.md Group B; rebuilt for PLAN.md 3.9.
 *
 * Pay card (surface, radius 26): eyebrow + balance, the amount as typed + USD line, token pill. A 40pt circle
 * with a 3pt ring OVERLAPS THE SEAM (margin −14, zIndex 2) and flips the pair. Receive card mirrors it. Rows:
 * Route / You receive at least / Price impact / Max slippage.
 *
 * It was a fixed WETH → USDC card whose token pills, direction circle and settings gear did nothing, and whose
 * "Review swap" opened a sell ticket at the stop tolerance. Now the pair is picked from what this executor settles
 * (with 1inch's token logos), the amount is typed, the tolerance is chosen and quoted at, and confirming sends the
 * swap itself — `POST /swap`, under the same permission as every other trade — and shows what arrived and where it
 * settled.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import { Icon } from '@/design/Icon';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  BackButton,
  Button,
  EmptyState,
  Eyebrow,
  Fill,
  IconButton,
  Keypad,
  Pill,
  Press,
  Price,
  Row,
  Screen,
  Text,
  colors,
  money,
  quantity,
  radius,
  size,
  space,
  type KeypadKey,
} from '@/ui';
import { MINUS, percent } from '@/format';
import { SWAP_SLIPPAGES, keypadPress, swapRequest, swapSpendable } from '@/state/derived';
import { usePrice } from '@/data/usePrices';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { apiReason } from '@/data/api';
import { errorText } from '@/data/apiError';
import { logoProps, useLogos } from '@/data/useLogos';
import { useSwapQuote } from '@/data/useSwapQuote';
import { system, type SwapOutcome } from '@/data/system';

const CARD_PAD = space.s18;
/** The seam circle. 40pt with a 3pt ring in the screen background, pulled −14 into both cards. */
const SEAM = 40;
const SEAM_RING = 3;
const SEAM_PULL = -14;

export default function Swap() {
  const goBack = useGoBack();
  const [pay, setPay] = useState('USDC');
  const [receive, setReceive] = useState('WETH');
  const [amount, setAmount] = useState('0');
  const [slippagePct, setSlippagePct] = useState<number>(0.3);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [picking, setPicking] = useState<'pay' | 'receive' | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [outcome, setOutcome] = useState<SwapOutcome>();

  /*
   * What can be swapped here is what this executor settles. Native ETH is left out: the permission moves ERC-20s,
   * and the executor takes "ETH" as WETH, which is listed. Where nothing settles the list is empty, and the screen
   * says so instead of offering a swap that could only be refused.
   */
  const tradable = useAsync(() => system.tradable(), []);
  const symbols = useMemo(
    () => (tradable.data ?? []).map((t) => t.symbol).filter((s) => s !== 'ETH'),
    [tradable.data],
  );
  const logos = useLogos(symbols);
  const nothingSettles = tradable.data !== undefined && symbols.length === 0;

  // The chain's balance, not the ledger's: what can be paid is what the wallet holds.
  const balance = useAsync(() => repos.portfolio.balance(), []);
  const spendable = swapSpendable(balance.data, pay);
  const balanceUnread = balance.data === undefined && balance.error !== undefined;

  const typed = Number(amount) || 0;
  const quote = useSwapQuote(pay, receive, typed, slippagePct);
  const { quote: payPrice } = usePrice(pay);
  const request = swapRequest({ pay, receive, amount, slippagePct });
  const overBalance = spendable !== undefined && typed > spendable;

  /** Any change to what is being swapped ends a review and clears the last result: they described another swap. */
  const edit = (change: () => void) => {
    change();
    setReviewing(false);
    setOutcome(undefined);
  };
  const pressKey = (key: KeypadKey) => edit(() => setAmount((a) => keypadPress(a, key)));
  const flip = () =>
    edit(() => {
      setPay(receive);
      setReceive(pay);
      // An amount of one token is not an amount of the other.
      setAmount('0');
    });
  const choose = (symbol: string) =>
    edit(() => {
      if (picking === 'pay') {
        if (symbol === receive) setReceive(pay);
        if (symbol !== pay) setAmount('0');
        setPay(symbol);
      } else if (picking === 'receive') {
        if (symbol === pay) setPay(receive);
        setReceive(symbol);
      }
      setPicking(null);
    });

  async function confirm() {
    if (!request || placing) return;
    setPlacing(true);
    try {
      const result = await system.swap(request);
      setOutcome(result);
      if (result.status === 'filled') {
        setAmount('0');
        balance.reload();
      }
    } catch (e) {
      setOutcome({ status: 'failed', error: errorText(e) });
    } finally {
      setPlacing(false);
      setReviewing(false);
    }
  }

  const q = quote.data;
  const cta =
    outcome?.status === 'filled'
      ? `Swapped ${quantity(outcome.sold)} ${outcome.from} for ${outcome.received === null ? 'at least the floor' : `${quantity(outcome.received)} ${outcome.to}`}`
      : reviewing && q
        ? `Confirm: ${amount} ${pay} for at least ${quantity(q.minimumOut)} ${receive}`
        : 'Review swap';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
          <BackButton onPress={() => goBack()} />
          <Text variant="cardTitle">Swap</Text>
        </View>
        <IconButton
          name="gear"
          accessibilityLabel={settingsOpen ? 'Hide swap settings' : 'Swap settings'}
          onPress={() => setSettingsOpen((o) => !o)}
        />
      </View>

      {settingsOpen ? (
        <View style={{ marginTop: space.s14, gap: space.s8 }}>
          <Eyebrow small>Max slippage</Eyebrow>
          <View style={{ flexDirection: 'row', gap: space.s8 }}>
            {SWAP_SLIPPAGES.map((pct) => (
              <Pill
                key={pct}
                label={percent(pct, { digits: 1, explicitSign: false })}
                selected={pct === slippagePct}
                onPress={() => edit(() => setSlippagePct(pct))}
              />
            ))}
          </View>
        </View>
      ) : null}

      {nothingSettles ? (
        <Fill style={{ justifyContent: 'center' }}>
          <EmptyState text="Nothing can be swapped on this network: 1inch has no deployment here, so no swap would settle." />
        </Fill>
      ) : (
        <Fill style={{ marginTop: space.s18 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.panelXl, padding: CARD_PAD, gap: space.s12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Eyebrow small>You pay</Eyebrow>
              <Press
                onPress={balanceUnread ? () => balance.reload() : undefined}
                accessibilityRole={balanceUnread ? 'button' : undefined}
                accessibilityLabel={balanceUnread ? `Retry reading your ${pay} balance` : undefined}
              >
                <Text variant="footnote" color={colors.ink40}>
                  {/* A dash while the balance loads, never a zero: see the note on `swapSpendable`. */}
                  {balanceUnread
                    ? `Balance ${MINUS} · tap to retry`
                    : `Balance ${spendable === undefined ? MINUS : quantity(spendable)}`}
                </Text>
              </Press>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Price variant="amountLg">{amount}</Price>
                <Text variant="secondarySm" style={{ marginTop: space.s4 }}>
                  {payPrice?.price !== undefined ? money(typed * payPrice.price) : 'No live price'}
                </Text>
              </View>
              <TokenPill symbol={pay} onPress={() => setPicking(picking === 'pay' ? null : 'pay')} label="Choose the token you pay" />
            </View>
          </View>

          <View style={{ alignItems: 'center', marginVertical: SEAM_PULL, zIndex: 2 }}>
            <Press
              onPress={flip}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${receive} and receive ${pay} instead`}
              style={{
                width: SEAM,
                height: SEAM,
                borderRadius: radius.full,
                backgroundColor: colors.control,
                borderWidth: SEAM_RING,
                borderColor: colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="swap" size={18} color={colors.ink} />
            </Press>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.panelXl, padding: CARD_PAD, gap: space.s12 }}>
            <Eyebrow small>You receive</Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Price variant="amountLg">{q ? quantity(q.outAmount) : MINUS}</Price>
                <Text variant="secondarySm" style={{ marginTop: space.s4 }}>
                  {q
                    ? `at least ${quantity(q.minimumOut)} ${receive} after slippage`
                    : !(typed > 0)
                      ? 'Type an amount'
                      : quote.loading
                        ? 'Getting a route…'
                        : (apiReason(quote.error) ?? 'No route available')}
                </Text>
              </View>
              <TokenPill
                symbol={receive}
                onPress={() => setPicking(picking === 'receive' ? null : 'receive')}
                label="Choose the token you receive"
              />
            </View>
          </View>

          {picking ? (
            <View style={{ marginTop: space.s18, gap: space.s8 }}>
              <Eyebrow small>{picking === 'pay' ? 'Pay with' : 'Receive'}</Eyebrow>
              {symbols.map((symbol) => {
                const held = swapSpendable(balance.data, symbol);
                return (
                  <Press
                    key={symbol}
                    onPress={() => choose(symbol)}
                    accessibilityRole="button"
                    accessibilityLabel={`${symbol}${held === undefined ? '' : `, ${quantity(held)} held`}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.s12,
                      padding: space.s12,
                      borderRadius: radius.card,
                      backgroundColor: symbol === (picking === 'pay' ? pay : receive) ? colors.control : colors.surface,
                    }}
                  >
                    <AssetMark gradient={assetGradient(symbol)} {...logoProps(logos, symbol)} size={size.markSm} />
                    <Text variant="rowPrimary" style={{ flex: 1 }}>
                      {symbol}
                    </Text>
                    <Text variant="footnote" color={colors.ink40}>
                      {held === undefined ? MINUS : `${quantity(held)} held`}
                    </Text>
                  </Press>
                );
              })}
            </View>
          ) : (
            <>
              <View style={{ marginTop: space.s14 }}>
                <Row
                  title="Route"
                  value={
                    <Text variant="rowPrimary" color={colors.ink55}>
                      {q?.route ?? (quote.loading ? 'Finding…' : quote.error ? 'No venue would quote' : MINUS)}
                    </Text>
                  }
                  height={46}
                />
                <Row
                  title="You receive at least"
                  // The floor, not a fee: xorr charges none, and this is the number the fill is held to on chain.
                  value={<Price>{q ? `${quantity(q.minimumOut)} ${receive}` : MINUS}</Price>}
                  height={46}
                />
                <Row
                  title="Price impact"
                  value={
                    <Price>
                      {q && q.priceImpactPct !== null ? percent(q.priceImpactPct, { digits: 3, explicitSign: false }) : MINUS}
                    </Price>
                  }
                  height={46}
                />
                <Row
                  title="Max slippage"
                  value={<Price>{percent(slippagePct, { digits: 1, explicitSign: false })}</Price>}
                  height={46}
                  divider={false}
                />
              </View>
              <Fill style={{ justifyContent: 'center' }}>
                <Keypad onPress={pressKey} />
              </Fill>
            </>
          )}
        </Fill>
      )}

      {!nothingSettles ? (
        <Button
          label={cta}
          variant={outcome?.status === 'filled' ? 'success' : 'primary'}
          style={{ marginTop: space.s14 }}
          loading={placing}
          disabled={outcome?.status !== 'filled' && (!request || overBalance || !q)}
          onPress={() => {
            if (outcome?.status === 'filled') return setOutcome(undefined);
            if (reviewing) return void confirm();
            setReviewing(true);
          }}
        />
      ) : null}

      <SwapNote
        outcome={outcome}
        overBalance={overBalance}
        spendable={spendable}
        pay={pay}
        reviewing={reviewing}
      />
    </Screen>
  );
}

/** The one sentence under the button: what happened, what is wrong, or what confirming will do. */
function SwapNote({
  outcome,
  overBalance,
  spendable,
  pay,
  reviewing,
}: {
  outcome: SwapOutcome | undefined;
  overBalance: boolean;
  spendable: number | undefined;
  pay: string;
  reviewing: boolean;
}) {
  const note =
    outcome?.status === 'filled'
      ? {
          text: `Settled through ${outcome.venue ?? 'the executor'} · ${outcome.txHash.slice(0, 10)}…${outcome.measured === false ? ' · the amount received is the floor the contract enforced' : ''}`,
          color: colors.ink40,
        }
      : outcome?.status === 'blocked'
        ? { text: outcome.detail, color: colors.down }
        : outcome?.status === 'failed'
          ? { text: outcome.error, color: colors.down }
          : overBalance
            ? { text: spendable === 0 ? `You hold no ${pay}.` : `You hold ${quantity(spendable ?? 0)} ${pay}.`, color: colors.down }
            : reviewing
              ? { text: 'Confirming sends it under your permission. The contract holds the fill to the floor above.', color: colors.ink40 }
              : null;
  if (!note) return null;
  return (
    <Text variant="footnote" color={note.color} align="center" style={{ marginTop: space.s10 }}>
      {note.text}
    </Text>
  );
}

function TokenPill({ symbol, onPress, label }: { symbol: string; onPress: () => void; label: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s6,
        height: 36,
        paddingHorizontal: space.s12,
        borderRadius: radius.card,
        backgroundColor: colors.control,
      }}
    >
      <Text variant="control">{symbol}</Text>
      <Icon name="chevron" size={11} color={colors.ink55} />
    </Press>
  );
}
