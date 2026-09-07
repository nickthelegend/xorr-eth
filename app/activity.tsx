/**
 * Screen 15 — Activity / audit log. screens.md Group D.
 *
 * Filter pills All / Trades / Risk / Blocked. Rows: an 8pt classification dot (up acted /
 * warn risk / down blocked), action + detail + "{agent} · {time}", the on-chain receipt
 * where there is one, and a right-aligned amount (up for credits, ink55 for debits).
 *
 * "The structured trail is the compliance artifact, so it stays a first-class action" — the
 * exports really export (PLAN.md 12.11); they are not decorative buttons.
 *
 * [G41] The `yield` row was orphaned by the original filter map; state/derived.ts folds it
 * into Trades so every row is reachable from a tab.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Fill,
  LoadingRows,
  Pill,
  PillRow,
  Press,
  Price,
  Screen,
  Text,
  colors,
  divider,
  noteDotColor,
  radius,
  space,
} from '@/ui';
import {
  ACTIVITY_FILTERS,
  activityAmountIsCredit,
  activityDot,
  filterActivity,
} from '@/state/derived';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { useRefreshControl } from '@/ui/useRefreshControl';
import { useStore } from '@/state/store';

const DOT = 8;

/**
 * "Check it on chain" — when there is a chain to check it on.
 *
 * `explorerTx` returns a real URL on a public network and a `fork:`/`local:` label
 * otherwise. Both are shown; only the first is tappable. Pretending a local transaction has
 * an explorer entry would be the sort of small dishonesty this whole screen exists to make
 * impossible.
 */
function ExplorerLink({ explorer }: { explorer: string }) {
  const isUrl = explorer.startsWith('http');
  if (!isUrl) {
    const [kind, ref] = explorer.split(':');
    return (
      <Text variant="footnote" color={colors.ink28}>
        {`${kind} · ${ref?.slice(0, 10) ?? ''}…`}
      </Text>
    );
  }
  return (
    <Press
      onPress={() => void Linking.openURL(explorer)}
      accessibilityRole="link"
      accessibilityLabel="View this transaction on BaseScan"
      hitHeight={24}
    >
      <Text variant="footnote" color={colors.ink55}>
        View on BaseScan ›
      </Text>
    </Press>
  );
}

export default function Activity() {
  const router = useRouter();
  const actFilter = useStore((s) => s.actFilter);
  const setActFilter = useStore((s) => s.setActFilter);
  const { data, loading, error, reload } = useAsync(() => repos.activity.list(), []);
  // Pulling down is the gesture people already try on a list of things that keep changing.
  const refresh = useRefreshControl(reload);
  const [exporting, setExporting] = useState(false);
  const [exportingTax, setExportingTax] = useState(false);
  const [exportError, setExportError] = useState<string>();

  const rows = filterActivity(data ?? [], actFilter);

  /**
   * The disposals file: every sale, its cost basis, and the gain or loss.
   *
   * Separate from the audit trail because they answer different questions for different
   * readers. Average cost is stated inside the file rather than assumed — a jurisdiction
   * that requires FIFO needs to be told this is not it.
   */
  async function exportDisposals() {
    setExportingTax(true);
    setExportError(undefined);
    try {
      const csv = await repos.activity.exportDisposals();
      await Share.share({ message: csv, title: 'xorr disposals' });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingTax(false);
    }
  }

  async function exportTrail() {
    setExporting(true);
    setExportError(undefined);
    try {
      const csv = await repos.activity.exportTrail('csv');
      await Share.share({ message: csv, title: 'xorr audit trail' });
    } catch (e) {
      // On the screen, not in a console nobody reads. An export that silently fails is
      // worse than none: the user walks away believing they have the record.
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Text variant="screenTitle">Activity</Text>
      <Text variant="secondary" style={{ marginTop: space.s10 }}>
        Every action an agent took, and every one it chose not to take.
      </Text>

      <PillRow style={{ marginTop: space.s18, flexGrow: 0 }}>
        {ACTIVITY_FILTERS.map((f, i) => (
          <Pill key={f} label={f} selected={i === actFilter} onPress={() => setActFilter(i)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s10 }}>
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
          <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false}>
            {rows.map((r) => {
              const credit = activityAmountIsCredit(r.amount);
              return (
                <View
                  key={r.id}
                  style={[
                    { flexDirection: 'row', gap: space.s12, paddingVertical: space.s14 },
                    divider,
                  ]}
                >
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: radius.full,
                      marginTop: space.s4,
                      backgroundColor: noteDotColor[activityDot(r.kind)],
                    }}
                  />
                  <View style={{ flex: 1, gap: space.s2 }}>
                    <Text variant="rowPrimary">{r.action}</Text>
                    <Text variant="secondarySm">{r.detail}</Text>
                    <Text variant="footnote" color={colors.ink28}>
                      {r.agent} · {r.t}
                    </Text>
                    {/*
                      The receipt, where there is one. A tappable link on a public chain; a
                      plain label on a fork or a local node, because a link to an explorer
                      that has never seen the transaction reads as the transaction not being
                      real.
                    */}
                    {r.explorer ? <ExplorerLink explorer={r.explorer} /> : null}
                  </View>
                  {r.amount ? (
                    <Price color={credit ? colors.up : colors.ink55}>{r.amount}</Price>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Fill>

      {exportError ? (
        <Text
          variant="secondarySm"
          color={colors.down}
          align="center"
          style={{ marginTop: space.s10 }}
        >
          {`That export did not go through: ${exportError}`}
        </Text>
      ) : null}

      {/*
        Two different documents, so two different buttons. The audit trail records what the
        BOT did; the disposals file records what the USER owes. Folding the second into the
        first would produce a file that is the wrong shape for both jobs — an accountant does
        not want blocked runs, and a compliance reviewer does not want cost basis.

        A plain row: `ButtonRow` is the secondary/affirmative pair for a decision, and these
        two are peers rather than a choice between them.
      */}
      <View style={{ flexDirection: 'row', gap: space.s10, marginTop: space.s14 }}>
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
