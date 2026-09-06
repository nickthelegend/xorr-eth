/**
 * The verification console.
 *
 * Every claim this project makes about itself, re-checked live, with the observed value and the
 * call that produced it. It exists because the product's whole argument is "you do not have to
 * trust us" — and a README that asserts a contract address is asking for exactly the trust the
 * contract was built to remove.
 *
 * Three rules it holds itself to:
 *
 *   - It shows what was OBSERVED, never just a green tick. A pass with nothing behind it is the
 *     same unfalsifiable claim in a nicer colour.
 *   - It shows failures. A console that only renders when everything is fine is marketing.
 *   - It shows the call, so the reader can repeat it somewhere this code cannot reach.
 *
 * Reachable without an account, like the endpoint behind it. Paste any address to run the
 * wallet-specific checks against it; they read public on-chain facts about an address anyone
 * could already look up on an explorer.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/design/Icon';
import { Screen, ScreenHeader, SheetCard } from '@/design/components';
import { borders, ink, pnl, surfaces } from '@/design/colors';
import { hairlineWidth, radius } from '@/design/space';
import { type } from '@/design/type';
import { api } from '@/data/api';
import { useAsync } from '@/data/useAsync';
import { useStore } from '@/state/store';

type Check = {
  id: string;
  claim: string;
  status: 'pass' | 'fail' | 'skip';
  observed: string;
  how: string;
  ms: number;
};

type Report = {
  checks: Check[];
  passed: number;
  failed: number;
  skipped: number;
  chain: string;
  at: string;
};

const TONE = {
  pass: { fg: pnl.up, bg: pnl.upBg, label: 'PASS' },
  fail: { fg: pnl.down, bg: pnl.downBg, label: 'FAIL' },
  skip: { fg: ink.i40, bg: 'rgba(255,255,255,0.06)', label: 'SKIP' },
} as const;

export default function Judge() {
  const router = useRouter();
  const wallet = useStore((s) => s.wallet);
  const [owner, setOwner] = useState(wallet?.address ?? '');
  // The address the last run used, so editing the field does not silently relabel the results
  // above it as being about an address they were never run against.
  const [ranFor, setRanFor] = useState(owner);
  const [nonce, setNonce] = useState(0);

  const report = useAsync(
    () =>
      // No auth needed — the route is public on purpose, so this works signed out.
      api.get<Report>(`/verify${ranFor ? `?owner=${encodeURIComponent(ranFor)}` : ''}`),
    [ranFor, nonce],
  );

  const rerun = useCallback(() => {
    setRanFor(owner.trim());
    setNonce((n) => n + 1);
  }, [owner]);

  const d = report.data;

  return (
    <Screen>
      <ScreenHeader
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
            >
              <Icon name="back" size={20} color={ink.full} />
            </Pressable>
            <Text style={[type.screenTitle, { color: ink.full }]}>Check it yourself</Text>
          </View>
        }
        right={
          <Pressable
            onPress={rerun}
            accessibilityRole="button"
            accessibilityLabel="Run the checks again"
            hitSlop={12}
            disabled={report.loading}
          >
            <Text style={[type.pill, { color: report.loading ? ink.i32 : ink.full }]}>
              {report.loading ? 'Running…' : 'Re-run'}
            </Text>
          </Pressable>
        }
      />

      <Text style={[type.body, { color: ink.i40, marginTop: 10 }]}>
        Every claim this app makes about itself, checked against the chain, the index and the feeds
        right now — not when this was written.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          backgroundColor: surfaces.control,
          borderRadius: radius.md2,
          paddingHorizontal: 14,
          height: 46,
        }}
      >
        <Text style={[type.eyebrowSm, { color: ink.i32 }]}>OWNER</Text>
        <TextInput
          value={owner}
          onChangeText={setOwner}
          onSubmitEditing={rerun}
          placeholder="0x… (optional)"
          placeholderTextColor={ink.i30}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Wallet address to check"
          style={[type.body, { color: ink.full, flex: 1 }]}
        />
      </View>

      <Screen.Content style={{ marginTop: 14 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/*
            Loading, failed-to-reach, and a report full of failures are three different states.
            The middle one is the easiest to get wrong: a console that renders nothing when the
            server is down looks identical to one where everything passed.
          */}
          {report.loading && !d ? (
            <Text style={[type.body, { color: ink.i40 }]}>Running the checks…</Text>
          ) : report.error ? (
            <SheetCard radius={radius.lg} padding={16}>
              <Text style={[type.rowPrimary, { color: pnl.down }]}>
                The executor did not answer.
              </Text>
              <Text style={[type.noteBody, { color: ink.i45, marginTop: 6 }]}>
                {report.error.message}
              </Text>
              <Text style={[type.footnote, { color: ink.i32, marginTop: 10 }]}>
                Nothing below is stale — there is nothing below. This is the console failing, not
                the claims.
              </Text>
            </SheetCard>
          ) : d ? (
            <>
              <Tally d={d} />
              {d.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
              <Text
                style={[type.footnote, { color: ink.i28, marginTop: 16, marginBottom: 8 }]}
              >
                Run at {new Date(d.at).toLocaleTimeString()} against {d.chain}. Every row above is
                a live read; nothing here is cached from a previous run or written into the app.
              </Text>
            </>
          ) : null}
        </ScrollView>
      </Screen.Content>
    </Screen>
  );
}

function Tally({ d }: { d: Report }) {
  const allGood = d.failed === 0;
  return (
    <SheetCard radius={radius.lg} padding={16} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[type.statLarge, { color: allGood ? pnl.up : pnl.down }]}>
          {d.passed}/{d.checks.length}
        </Text>
        <Text style={[type.body, { color: ink.i40 }]}>
          {allGood ? 'claims verified' : `verified · ${d.failed} failing`}
        </Text>
      </View>
      {d.skipped > 0 ? (
        <Text style={[type.footnote, { color: ink.i32, marginTop: 6 }]}>
          {d.skipped} skipped — those need a wallet address, and none was given. Skipped is not
          passed.
        </Text>
      ) : null}
    </SheetCard>
  );
}

function CheckRow({ check }: { check: Check }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[check.status];
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${check.claim} — ${tone.label}. ${open ? 'Hide' : 'Show'} how this was checked.`}
      accessibilityState={{ expanded: open }}
      style={{
        paddingVertical: 13,
        borderBottomWidth: hairlineWidth,
        borderBottomColor: borders.hairline,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View
          style={{
            backgroundColor: tone.bg,
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={[type.tagSm, { color: tone.fg }]}>{tone.label}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.rowPrimary, { color: ink.full }]}>{check.claim}</Text>
          {/* The observed value is the point. It gets the same weight as the claim, not less. */}
          <Text
            style={[
              type.noteBody,
              { color: check.status === 'fail' ? pnl.down : ink.i55, marginTop: 4 },
            ]}
          >
            {check.observed}
          </Text>
          {open ? (
            <Text style={[type.footnote, { color: ink.i32, marginTop: 8 }]}>
              {check.how} · {check.ms}ms
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
