/**
 * Assets tab — NEW. PLAN.md 10.2 / §3.5.
 *
 * The handoff's "Assets" tab was never designed [G13]. Built from parts that already exist:
 * the stacked proportion bar from screen 10, holdings rows, the realised card, and the
 * wallet. No new visual language — and no design values of its own; everything is `src/ui`.
 */
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { assetGradient } from '@/design/gradients';
import {
  AssetMark,
  EmptyState,
  Eyebrow,
  LoadingRows,
  Price,
  Row,
  Screen,
  SheetCard,
  Text,
  colors,
  money,
  percent,
  pnlTone,
  quantity,
  radius,
  size,
  space,
  ErrorState,
  NoteStrip,
} from '@/ui';
import { signedMoney } from '@/format';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { logoProps, useLogos } from '@/data/useLogos';
import { walletTokens } from '@/data/walletTokens';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { useStore } from '@/state/store';
import { driftSentence, holdingDrift, weightBarPct } from '@/state/derived';

const BAR_H = 8;

/*
 * A balance too small for four places, or a value under a cent, is still held (PLAN.md 3.10). `quantity` prints dust as
 * "0.0000" and `money` as "$0.00", both of which read as holding nothing, so these say how small instead.
 */
const SMALLEST_UNITS = 0.0001;
const CENT = 0.01;

function tokenUnits(units: number): string {
  return units > 0 && units < SMALLEST_UNITS ? `< ${quantity(SMALLEST_UNITS)}` : quantity(units);
}

function tokenUsd(usd: number): string {
  return usd > 0 && usd < CENT ? `< ${money(CENT)}` : money(usd);
}

/** Said rather than left out, because a list that silently omits a held token reads as the whole wallet. */
function undescribedNote(count: number): string {
  return count === 1
    ? 'One more token is held here but not listed: 1inch would not say what it is.'
    : `${count} more tokens are held here but not listed: 1inch would not say what they are.`;
}

export default function Assets() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const balance = useAsync(() => repos.portfolio.balanceUsd(), []);
  const sleeves = useAsync(() => repos.portfolio.sleeves(), []);
  // The chain's word on this wallet (PLAN.md 3.10). Refreshed with the balance, because a trade changes both at once.
  const tokens = useAsync(() => walletTokens(), []);
  const refresh = useRefreshControl(() => Promise.all([balance.reload(), sleeves.reload(), tokens.reload()]));
  const positions = useAsync(() => repos.portfolio.positions(), []);
  const realised = useAsync(() => repos.portfolio.realised(), []);

  /*
   * The mix the user APPROVED, not the fixture defaults.
   *
   * `sleeves()` returns product config — the three sleeve names, colours and starting weights —
   * and the proposal screen lets the user move those weights before approving them. This screen
   * read the fixture, so a user who had rebalanced to 70/20/10 was shown 55/30/15.
   */
  const approvedWeights = useStore((st) => st.weights);
  const weights = (sleeves.data ?? []).map((sleeve, i) => approvedWeights[i] ?? sleeve.weight);
  // Real holdings from the position book. This previously listed watchlist FIXTURES, so it
  // showed assets the user did not own at prices that never moved.
  const holdings = useMemo(() => positions.data ?? [], [positions.data]);
  const logos = useLogos(useMemo(() => holdings.map((h) => h.symbol), [holdings]));
  const tokenRows = useMemo(() => tokens.data?.tokens ?? [], [tokens.data]);
  /*
   * The marks use the logo the executor sent with each token instead of asking `/market/logos` by symbol, which knows
   * only the registry, and a ticker is a label two tokens can share. Keyed by address for the same reason. Every entry
   * is a settled answer, so no mark is left waiting.
   */
  const tokenLogos = useMemo(
    () => Object.fromEntries(tokenRows.map((t) => [t.address, t.logo])),
    [tokenRows],
  );

  return (
    <Screen tabBar>
      <Text variant="screenTitle">Assets</Text>

      <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: space.s20 }}>
        <Eyebrow small>Portfolio value</Eyebrow>
        {/* `money(balance.data ?? 0)` reported "$0.00" whenever the executor was
            unreachable — a confident number for a question we never got to ask. An em dash
            says the same thing the code actually knows.

            And only that. `undefined` is "not back yet", which is a different state from `null`'s
            "could not be read", and collapsing them showed the could-not-read dash for the twenty
            seconds this executor takes to answer. Sixth site with this conflation. */}
        <Price variant="heroBalance" style={{ marginTop: space.s8 }}>
          {balance.data !== null && balance.data !== undefined
            ? money(balance.data)
            : balance.loading
              ? '· · ·'
              : '—'}
        </Price>
        {balance.error ? (
          <Text variant="secondary" style={{ marginTop: space.s6 }}>
            Could not reach the executor, so this is not your balance.
          </Text>
        ) : null}

        <SheetCard borderRadius={radius.panel} padding={space.s16} style={{ marginTop: space.s20 }}>
          {/*
            "Allocation" was a claim about what the wallet HOLDS, and these numbers are not that.
            They are the target mix — product config the user adjusts and approves on the proposal
            screen — sitting directly above the real Holdings list. So a wallet holding no
            tokenized equities displayed "Tokenized equities 30%" as though it did. The numbers are
            fine; the word was wrong, and the caption now says which of the two this is.
          */}
          <Eyebrow small>Target mix</Eyebrow>
          <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s6 }}>
            What you asked the bot to aim for. Holdings below are what it actually owns.
          </Text>
          {/* The 8pt stacked proportion bar from screen 10, reused verbatim. */}
          <View style={{ flexDirection: 'row', gap: space.s2, height: BAR_H, marginTop: space.s12 }}>
            {(sleeves.data ?? []).map((s, i) => (
              <View
                key={s.name}
                style={{
                  width: `${weightBarPct(weights, i)}%`,
                  backgroundColor: s.color,
                  borderRadius: BAR_H / 2,
                }}
              />
            ))}
          </View>
          <View style={{ marginTop: space.s14, gap: space.s10 }}>
            {(sleeves.data ?? []).map((s, i) => (
              <View
                key={s.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s10 }}
              >
                <View
                  style={{
                    width: BAR_H,
                    height: BAR_H,
                    borderRadius: BAR_H / 2,
                    backgroundColor: s.color,
                  }}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  {s.name}
                </Text>
                <Price color={colors.ink55}>{weights[i] ?? s.weight}%</Price>
              </View>
            ))}
          </View>
        </SheetCard>

        <Text variant="cardTitle" style={{ marginTop: space.s26, marginBottom: space.s6 }}>
          Holdings
        </Text>
        {positions.loading ? (
          <LoadingRows count={2} height={size.rowLg} />
        ) : positions.error ? (
          /*
           * "Nothing held yet" is a claim about a wallet, and an unanswered read is not one.
           *
           * PORTFOLIO VALUE above already refuses to print a number it does not have, and this
           * said "Nothing held yet" beside it — so a signed-out visitor, or one whose read failed,
           * was told their holdings were empty in the same breath as being told the total was
           * unknown.
           */
          <ErrorState error={positions.error} onRetry={positions.reload} />
        ) : holdings.length === 0 ? (
          <EmptyState
            text="Nothing held yet. A recurring buy is the simplest way to start."
            actionLabel="Set one up"
            onAction={() => router.push('/strategy/dca')}
          />
        ) : (
          holdings.map((h) => (
            <Row
              key={h.id}
              left={<AssetMark gradient={assetGradient(h.symbol)} {...logoProps(logos, h.symbol)} size={32} />}
              title={h.symbol}
              secondary={`${quantity(h.units)} · avg ${money(h.entry)}`}
              value={<Price>{money(h.notional)}</Price>}
              delta={percent(h.unrealisedPct)}
              deltaTone={pnlTone(h.unrealised)}
              height={size.rowLg}
              onPress={() => router.push(`/asset/${h.symbol}`)}
            />
          ))
        )}
        {/* Where the ledger and the wallet disagree, said beside the numbers it changes (PLAN.md 2.7). */}
        {holdings.map((h) => {
          const drift = holdingDrift(h);
          return drift ? (
            <NoteStrip key={`drift-${h.id}`} kind="risk" style={{ marginTop: space.s10 }}>
              {driftSentence(h.symbol, drift)}
            </NoteStrip>
          ) : null;
        })}

        {/*
          The chain's word, beside the ledger's (PLAN.md 3.10).

          Holdings above are the book the executor keeps from its own fills. A wallet holds more than that — the ETH
          that pays for gas, a deposit, a token sent in — so this lists what is actually at the address: 1inch's
          Balance API on Base, the chain itself on a fork or a testnet. Where the two disagree, this one is the wallet.
        */}
        <Text variant="cardTitle" style={{ marginTop: space.s26, marginBottom: space.s6 }}>
          Tokens
        </Text>
        <Text variant="secondarySm" color={colors.ink40} style={{ marginBottom: space.s6 }}>
          {tokens.data?.source === '1inch'
            ? 'Read from the chain through 1inch, not from the ledger above.'
            : 'Read from the chain, not from the ledger above.'}
        </Text>
        {tokens.error ? (
          /* A failed read says so. An empty list here would be a claim that the wallet holds nothing. */
          <ErrorState error={tokens.error} onRetry={tokens.reload} />
        ) : tokens.loading && !tokens.data ? (
          <LoadingRows count={2} height={size.rowLg} />
        ) : tokenRows.length === 0 ? (
          <EmptyState text="The chain shows no tokens in this wallet." />
        ) : (
          tokenRows.map((t) => (
            <Row
              key={t.address}
              left={<AssetMark gradient={assetGradient(t.symbol)} {...logoProps(tokenLogos, t.address)} size={32} />}
              title={t.symbol}
              secondary={t.name ? `${tokenUnits(t.units)} · ${t.name}` : tokenUnits(t.units)}
              value={<Price>{t.usd === null ? '—' : tokenUsd(t.usd)}</Price>}
              height={size.rowLg}
            />
          ))
        )}
        {tokens.data && tokens.data.undescribed.length > 0 ? (
          <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s10 }}>
            {undescribedNote(tokens.data.undescribed.length)}
          </Text>
        ) : null}

        {/*
          Money actually taken, kept apart from money on paper.
          `Holdings` above shows what the open book is worth today, which is an opinion that
          changes every minute. This is the other number — what selling has actually realised
          — and it used to exist nowhere: a position that closed took its profit out of the
          app with it, because the holdings query correctly filters to units > 0.
        */}
        {realised.data && realised.data.bySymbol.length > 0 ? (
          <SheetCard
            borderRadius={radius.panel}
            padding={space.s16}
            style={{ marginTop: space.s26 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Eyebrow small>Realised</Eyebrow>
              <Price tone={pnlTone(realised.data.total)}>{signedMoney(realised.data.total)}</Price>
            </View>
            {realised.data.bySymbol.map((r) => (
              <View
                key={r.symbol}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: space.s10,
                }}
              >
                <Text variant="body" color={colors.ink55}>
                  {r.symbol} · {quantity(r.unitsSold)} sold
                  {/* Said inline, because a number that quietly understates is worse than
                      one that admits it. */}
                  {r.basisIncomplete ? ' · basis incomplete' : ''}
                </Text>
                <Price variant="body" tone={pnlTone(r.realised)}>
                  {signedMoney(r.realised)}
                </Price>
              </View>
            ))}
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s12 }}>
              At average cost. Closed positions stay here even though they are no longer
              holdings.
            </Text>
          </SheetCard>
        ) : null}

        <SheetCard
          borderRadius={radius.panel}
          padding={space.s16}
          style={{ marginTop: space.s26, marginBottom: space.s26 }}
        >
          <Eyebrow small>Wallet</Eyebrow>
          <Text variant="body" style={{ marginTop: space.s8 }} numberOfLines={1}>
            {wallet?.address ?? 'No wallet connected'}
          </Text>
          <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }}>
            {wallet
              ? // The live chain, not the one the wallet row was stamped with at creation.
                `${wallet.kind === 'embedded' ? 'Created in xorr' : 'Connected'} · ${wallet.chain ?? wallet.cluster}`
              : 'Create or connect one to let the bot trade.'}
          </Text>
        </SheetCard>
      </ScrollView>
    </Screen>
  );
}
