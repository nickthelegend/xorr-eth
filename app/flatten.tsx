/**
 * Sell everything, now.
 *
 * The safety screen already had "Stop all agents", and stopping is not the same as getting out.
 * A person who wants their money in cash had to revoke the permission and then place every sell
 * by hand on a screen designed for one considered trade at a time — at exactly the moment they
 * were least able to do that carefully.
 *
 * The screen's job is to make the consequences legible BEFORE the tap, and then to be completely
 * honest about the outcome. Two things it deliberately does:
 *
 *   - It shows what it would sell, priced, before you commit. A destructive action that will not
 *     tell you what it is about to destroy is not a confirmation, it is a dare.
 *   - It reports each position separately afterwards. A flatten that sold three of four and said
 *     "done" would be lying about the fourth, and the fourth is the one still exposed.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, IconButton, Screen, ScreenHeader, SheetCard } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { money, quantity } from '@/format';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';

type Leg = { symbol: string; units: number; usd: number };
type Preview = { legs: Leg[]; totalUsd: number; dustBelowUsd: number; skipped: string[]; slippagePct: number };
type ResultLeg = Leg & { status: 'sold' | 'failed' | 'skipped'; detail: string; explorer?: string };
type Result = { legs: ResultLeg[]; sold: number; failed: number };

export default function Flatten() {
  const router = useRouter();
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
      <ScreenHeader
        left={<Text style={[type.screenTitle, { color: ink.full }]}>Sell everything</Text>}
        right={<IconButton name="close" onPress={() => router.back()} accessibilityLabel="Close" />}
      />

      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        Closes every position into USDC and leaves it in your own wallet. It does not touch your
        permission — the bot stays stopped or running exactly as you left it.
      </Text>

      <Screen.Content style={{ marginTop: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {result ? (
            <Outcome result={result} />
          ) : preview.loading && !p ? (
            <Text style={[type.body, { color: ink.i40 }]}>Reading your positions…</Text>
          ) : preview.error ? (
            <SheetCard radius={radius.lg} padding={16}>
              <Text style={[type.rowPrimary, { color: pnl.down }]}>
                Could not read your positions.
              </Text>
              <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
                {preview.error.message}
              </Text>
              <Text style={[type.footnote, { color: ink.i32, marginTop: 10 }]}>
                Nothing was sold. Your funds are in your wallet and you can move them yourself.
              </Text>
            </SheetCard>
          ) : nothingToDo ? (
            <SheetCard radius={radius.lg} padding={16}>
              <Text style={[type.rowPrimary, { color: ink.full }]}>Nothing to sell.</Text>
              <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
                You hold no positions above {money(p.dustBelowUsd)}. Your balance is already cash.
              </Text>
            </SheetCard>
          ) : p ? (
            <>
              <SheetCard radius={radius.lg} padding={16}>
                <Text style={[type.eyebrowSm, { color: ink.i32 }]}>WOULD SELL</Text>
                {p.legs.map((l) => (
                  <View
                    key={l.symbol}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderBottomWidth: hairlineWidth,
                      borderBottomColor: borders.hairline,
                    }}
                  >
                    <View>
                      <Text style={[type.rowPrimary, { color: ink.full }]}>{l.symbol}</Text>
                      <Text style={[type.footnote, { color: ink.i38 }]}>
                        {/*
                          `quantity`, not toFixed. The screen layer formats through one place so
                          grouping and the U+2212 minus are consistent everywhere — and the audit
                          test in src/qa enforces it, which is how this got caught.
                        */}
                        {quantity(l.units, 6)} {l.symbol}
                      </Text>
                    </View>
                    <Text style={[type.rowValue, { color: ink.full }]}>{money(l.usd)}</Text>
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                  }}
                >
                  <Text style={[type.rowPrimary, { color: ink.i55 }]}>Roughly</Text>
                  <Text style={[type.rowPrimary, { color: ink.full }]}>{money(p.totalUsd)}</Text>
                </View>
              </SheetCard>

              {/*
                The two things people are surprised by afterwards, said before.
                Slippage, because a panic exit accepts more of it than a scheduled buy — on
                purpose, since not executing is the worse outcome. And dust, because a leftover
                $0.40 of something looks like the flatten failed.
              */}
              <View style={{ marginTop: 14, gap: 8 }}>
                <Text style={[type.noteBody, { color: ink.i45 }]}>
                  Market orders, up to {p.slippagePct}% slippage. That is wider than a scheduled
                  buy allows, because an exit that refuses to execute is not an exit.
                </Text>
                {p.skipped.length > 0 ? (
                  <Text style={[type.noteBody, { color: ink.i45 }]}>
                    Leaving {p.skipped.join(', ')} alone — worth under {money(p.dustBelowUsd)}, and
                    the gas would cost more than the sale returns.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {error ? (
            <Text style={[type.noteBody, { color: pnl.down, marginTop: 14 }]}>{error}</Text>
          ) : null}
        </ScrollView>
      </Screen.Content>

      {result ? (
        <Button label="Done" variant="primary" height={56} onPress={() => router.back()} />
      ) : (
        <Button
          label={p && p.legs.length > 0 ? `Sell ${money(p.totalUsd)} into USDC` : 'Sell everything'}
          variant="destructive"
          height={56}
          disabled={nothingToDo || preview.loading}
          loading={busy}
          onPress={flatten}
        />
      )}
      <Text style={[type.footnote, { color: ink.i28, textAlign: 'center', marginTop: 12 }]}>
        The cash lands in your wallet, not ours. This does not use your daily cap.
      </Text>
    </Screen>
  );
}

function Outcome({ result }: { result: Result }) {
  const failed = result.legs.filter((l) => l.status === 'failed');
  return (
    <>
      <SheetCard radius={radius.lg} padding={16}>
        <Text
          style={[type.rowPrimaryLg, { color: failed.length ? pnl.warn : pnl.up }]}
        >
          {failed.length
            ? `${result.sold} sold, ${failed.length} could not be`
            : result.sold === 0
              ? 'There was nothing to sell'
              : `${result.sold} position${result.sold === 1 ? '' : 's'} closed`}
        </Text>
        {failed.length ? (
          <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
            You are still holding the ones below. Nothing about them changed.
          </Text>
        ) : null}
      </SheetCard>

      {result.legs.map((l) => (
        <View
          key={l.symbol}
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: radius.md2,
            backgroundColor: surfaces.surface,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.rowPrimary, { color: ink.full }]}>{l.symbol}</Text>
            <Text
              style={[
                type.tagSm,
                { color: l.status === 'sold' ? pnl.up : l.status === 'failed' ? pnl.down : ink.i40 },
              ]}
            >
              {l.status.toUpperCase()}
            </Text>
          </View>
          <Text style={[type.noteBody, { color: ink.i45, marginTop: 4 }]}>{l.detail}</Text>
          {l.explorer ? (
            <Text style={[type.footnote, { color: ink.i28, marginTop: 6 }]}>{l.explorer}</Text>
          ) : null}
        </View>
      ))}
    </>
  );
}
