/**
 * Sell everything, now.
 *
 * The safety screen already had "Stop all agents", and stopping is not the same as getting
 * out. A person who wants their money in cash had to revoke the permission and then place
 * every sell by hand on a screen designed for one considered trade at a time — at exactly
 * the moment they were least able to do that carefully.
 *
 * The screen's job is to make the consequences legible BEFORE the tap, and then to be
 * completely honest about the outcome. Two things it deliberately does:
 *
 *   - It shows what it would sell, priced, before you commit. A destructive action that will
 *     not tell you what it is about to destroy is not a confirmation, it is a dare.
 *   - It reports each position separately afterwards. A flatten that sold three of four and
 *     said "done" would be lying about the fourth, and the fourth is the one still exposed.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  Button,
  Eyebrow,
  Fill,
  IconButton,
  Price,
  Screen,
  SheetCard,
  Tag,
  Text,
  colors,
  divider,
  money,
  quantity,
  radius,
  size,
  space,
} from '@/ui';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';

type Leg = { symbol: string; units: number; usd: number };
type Preview = {
  legs: Leg[];
  totalUsd: number;
  dustBelowUsd: number;
  skipped: string[];
  slippagePct: number;
};
type ResultLeg = Leg & { status: 'sold' | 'failed' | 'skipped'; detail: string; explorer?: string };
type Result = { legs: ResultLeg[]; sold: number; failed: number };

export default function Flatten() {
  const goBack = useGoBack();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();

  const preview = useAsync(() => api.get<Preview>('/panic/preview'), []);

  const flatten = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await api.post<Result>('/panic/flatten', {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const p = preview.data;
  const nothingToDo = !!p && p.legs.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="screenTitle">Sell everything</Text>
        <IconButton name="close" accessibilityLabel="Close" onPress={() => goBack()} />
      </View>

      <Text variant="body" color={colors.ink40} style={{ marginTop: space.s10 }}>
        Closes every position into USDC and leaves it in your own wallet. It does not touch
        your permission — the bot stays stopped or running exactly as you left it.
      </Text>

      <Fill style={{ marginTop: space.s16 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {result ? (
            <Outcome result={result} />
          ) : preview.loading && !p ? (
            <Text variant="body" color={colors.ink40}>
              Reading your positions…
            </Text>
          ) : preview.error ? (
            <SheetCard borderRadius={radius.note} padding={space.s16}>
              <Text variant="rowPrimary" color={colors.down}>
                Could not read your positions.
              </Text>
              <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s6 }}>
                {preview.error.message}
              </Text>
              <Text variant="footnote" color={colors.ink32} style={{ marginTop: space.s10 }}>
                Nothing was sold. Your funds are in your wallet and you can move them yourself.
              </Text>
            </SheetCard>
          ) : nothingToDo ? (
            <SheetCard borderRadius={radius.note} padding={space.s16}>
              <Text variant="rowPrimary">Nothing to sell.</Text>
              <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s6 }}>
                You hold no positions above {money(p.dustBelowUsd)}. Your balance is already
                cash.
              </Text>
            </SheetCard>
          ) : p ? (
            <>
              <SheetCard borderRadius={radius.note} padding={space.s16}>
                <Eyebrow small>Would sell</Eyebrow>
                {p.legs.map((l) => (
                  <View
                    key={l.symbol}
                    style={[
                      {
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: space.s10,
                      },
                      divider,
                    ]}
                  >
                    <View>
                      <Text variant="rowPrimary">{l.symbol}</Text>
                      {/*
                        `quantity`, not toFixed. The screen layer formats through one place so
                        grouping and the U+2212 minus are consistent everywhere — and the
                        audit test in src/qa enforces it, which is how this got caught.
                      */}
                      <Text variant="footnote" color={colors.ink38}>
                        {quantity(l.units, 6)} {l.symbol}
                      </Text>
                    </View>
                    <Price>{money(l.usd)}</Price>
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingTop: space.s12,
                  }}
                >
                  <Text variant="rowPrimary" color={colors.ink55}>
                    Roughly
                  </Text>
                  <Price>{money(p.totalUsd)}</Price>
                </View>
              </SheetCard>

              {/*
                The two things people are surprised by afterwards, said before.
                Slippage, because a panic exit accepts more of it than a scheduled buy — on
                purpose, since not executing is the worse outcome. And dust, because a
                leftover $0.40 of something looks like the flatten failed.
              */}
              <View style={{ marginTop: space.s14, gap: space.s8 }}>
                <Text variant="secondarySm" color={colors.ink45}>
                  Market orders, up to {p.slippagePct}% slippage. That is wider than a
                  scheduled buy allows, because an exit that refuses to execute is not an exit.
                </Text>
                {p.skipped.length > 0 ? (
                  <Text variant="secondarySm" color={colors.ink45}>
                    Leaving {p.skipped.join(', ')} alone — worth under {money(p.dustBelowUsd)},
                    and the gas would cost more than the sale returns.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {error ? (
            <Text variant="secondarySm" color={colors.down} style={{ marginTop: space.s14 }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </Fill>

      {result ? (
        <Button label="Done" height={size.buttonLg} onPress={() => goBack()} />
      ) : (
        <Button
          label={p && p.legs.length > 0 ? `Sell ${money(p.totalUsd)} into USDC` : 'Sell everything'}
          variant="destructive"
          height={size.buttonLg}
          disabled={nothingToDo || preview.loading}
          loading={busy}
          onPress={flatten}
        />
      )}
      <Text
        variant="footnote"
        color={colors.ink28}
        align="center"
        style={{ marginTop: space.s12 }}
      >
        The cash lands in your wallet, not ours. This does not use your daily cap.
      </Text>
    </Screen>
  );
}

function Outcome({ result }: { result: Result }) {
  const failed = result.legs.filter((l) => l.status === 'failed');
  return (
    <>
      <SheetCard borderRadius={radius.note} padding={space.s16}>
        <Text variant="rowPrimaryLg" color={failed.length ? colors.warn : colors.up}>
          {failed.length
            ? `${result.sold} sold, ${failed.length} could not be`
            : result.sold === 0
              ? 'There was nothing to sell'
              : `${result.sold} position${result.sold === 1 ? '' : 's'} closed`}
        </Text>
        {failed.length ? (
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s6 }}>
            You are still holding the ones below. Nothing about them changed.
          </Text>
        ) : null}
      </SheetCard>

      {result.legs.map((l) => (
        <View
          key={l.symbol}
          style={{
            marginTop: space.s10,
            padding: space.s14,
            borderRadius: radius.tile,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="rowPrimary">{l.symbol}</Text>
            <Tag
              label={l.status}
              small
              tone={l.status === 'sold' ? 'up' : l.status === 'failed' ? 'down' : 'neutral'}
            />
          </View>
          <Text variant="secondarySm" color={colors.ink45} style={{ marginTop: space.s4 }}>
            {l.detail}
          </Text>
          {l.explorer ? (
            <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s6 }} selectable>
              {l.explorer}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}
