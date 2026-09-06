/**
 * Screen 15 — Activity / audit log. screens.md Group D.
 *
 * Filter pills All / Trades / Risk / Blocked. Rows: an 8px classification dot (up acted /
 * warn risk / down blocked), then action + detail + "{agent} · {time}", with a right-aligned
 * amount (up for credits, ink55 for debits). Empty state "Nothing here yet."
 * Ghost "Export audit trail".
 *
 * "The structured trail is the compliance artifact, so it stays a first-class action" — the export
 * really exports (PLAN.md 12.11); it is not a decorative button.
 *
 * [G41] The `yield` row was orphaned by the original filter map; state/derived.ts folds it into
 * Trades so every row is reachable from a tab.
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingRows,
  Pill,
  PillRow,
  Screen,
  ScreenHeader,
} from '@/design/components';
import { eventDotColor } from '@/design/components/NoteStrip';
import { borders, ink, pnl } from '@/design/colors';
import { hairlineWidth } from '@/design/space';
import { type } from '@/design/type';
import {
  ACTIVITY_FILTERS,
  activityAmountIsCredit,
  activityDot,
  filterActivity,
} from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';
import { useRouter } from 'expo-router';

/**
 * "Check it on chain" — when there is a chain to check it on.
 *
 * `explorerTx` returns a real URL on a public network and a `fork:`/`local:` label otherwise. Both
 * are shown; only the first is tappable. Pretending a local transaction has an explorer entry
 * would be the sort of small dishonesty this whole screen exists to make impossible.
 */
function ExplorerLink({ explorer }: { explorer: string }) {
  const isUrl = explorer.startsWith('http');
  const short = isUrl ? 'View on BaseScan ›' : `${explorer.split(':')[0]} · ${explorer.split(':')[1]?.slice(0, 10)}…`;
  if (!isUrl) {
    return <Text style={[type.footnote, { color: ink.i28 }]}>{short}</Text>;
  }
  return (
    <Pressable
      onPress={() => void Linking.openURL(explorer)}
      accessibilityRole="link"
      accessibilityLabel="View this transaction on BaseScan"
      hitSlop={6}
    >
      <Text style={[type.footnote, { color: ink.i55 }]}>{short}</Text>
    </Pressable>
  );
}

export default function Activity() {
  const router = useRouter();
  const actFilter = useStore((s) => s.actFilter);
  const setActFilter = useStore((s) => s.setActFilter);
  const { data, loading, error, reload } = useAsync(() => repos.activity.list(), []);
  const [exporting, setExporting] = useState(false);
  const [exportingTax, setExportingTax] = useState(false);

  const rows = filterActivity(data ?? [], actFilter);

  /**
   * The disposals file: every sale, its cost basis, and the gain or loss.
   *
   * Separate from the audit trail because they answer different questions for different readers.
   * Average cost is stated inside the file rather than assumed — a jurisdiction that requires FIFO
   * needs to be told this is not it.
   */
  async function exportDisposals() {
    setExportingTax(true);
    try {
      const csv = await repos.activity.exportDisposals();
      await Share.share({ message: csv, title: 'xorr disposals' });
    } catch (e) {
      console.warn('disposal export failed', e);
    } finally {
      setExportingTax(false);
    }
  }

  async function exportTrail() {
    setExporting(true);
    try {
      const csv = await repos.activity.exportTrail('csv');
      await Share.share({ message: csv, title: 'xorr audit trail' });
    } catch (e) {
      // Surfaced inline rather than swallowed — an export that silently fails is worse than none.
      console.warn('export failed', e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader left={<Text style={[type.screenTitle, { color: ink.full }]}>Activity</Text>} />
      <Text style={[type.secondary, { color: ink.i40, marginTop: 10 }]}>
        Every action an agent took, and every one it chose not to take.
      </Text>

      <PillRow style={{ marginTop: 18, flexGrow: 0 }}>
        {ACTIVITY_FILTERS.map((f, i) => (
          <Pill key={f} label={f} selected={i === actFilter} onPress={() => setActFilter(i)} />
        ))}
      </PillRow>

      <Screen.Content style={{ marginTop: 10 }}>
        {loading && !data ? (
          <LoadingRows count={5} height={72} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
              text="Nothing here yet. The trail fills itself the first time an agent acts — or declines to."
              actionLabel="Set up a recurring buy"
              onAction={() => router.push('/strategy/dca')}
            />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {rows.map((r) => {
              const credit = activityAmountIsCredit(r.amount);
              return (
                <View
                  key={r.id}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingVertical: 14,
                    borderBottomWidth: hairlineWidth,
                    borderBottomColor: borders.hairline,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      marginTop: 5,
                      backgroundColor: eventDotColor[activityDot(r.kind)],
                    }}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[type.rowPrimary, { color: ink.full }]}>{r.action}</Text>
                    <Text style={[type.secondary, { color: ink.i38 }]}>{r.detail}</Text>
                    <Text style={[type.footnote, { color: ink.i28 }]}>
                      {r.agent} · {r.t}
                    </Text>
                    {/*
                      The receipt, where there is one.
                      A tappable link on a public chain; a plain label on a fork or a local node,
                      because a link to an explorer that has never seen the transaction reads as
                      the transaction not being real.
                    */}
                    {r.explorer ? <ExplorerLink explorer={r.explorer} /> : null}
                  </View>
                  {r.amount ? (
                    <Text style={[type.rowValue, { color: credit ? pnl.up : ink.i55 }]}>
                      {r.amount}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Screen.Content>

      {/*
        Two different documents, so two different buttons.
        The audit trail records what the BOT did; the disposals file records what the USER owes.
        Folding the second into the first would produce a file that is the wrong shape for both
        jobs — an accountant does not want blocked runs, and a compliance reviewer does not want
        cost basis.
      */}
      {/* A plain row: `ButtonRow` is the secondary/affirmative pair for a decision, and these two
          are peers rather than a choice between them. */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button
          label="Export audit trail"
          variant="ghost"
          loading={exporting}
          onPress={exportTrail}
          style={{ flex: 1 }}
        />
        <Button
          label="Disposals (CSV)"
          variant="ghost"
          loading={exportingTax}
          onPress={exportDisposals}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}
