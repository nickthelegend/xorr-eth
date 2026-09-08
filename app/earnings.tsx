/**
 * When each tokenized equity last reported, and when it is projected to report next.
 *
 * Straight from EDGAR — the dates are the regulator's own filing record, not a vendor's calendar.
 * This has driven the event-driven planner since it was written and was reachable from nowhere in
 * the app, which is strange for a product shipping an agent whose entire mandate is trading around
 * these dates.
 *
 * The projection is labelled as one, with the error the company's own cadence justifies. A
 * predicted date rendered in the same weight as the observed ones is a date someone trades on, and
 * the difference between "they filed on this day" and "they usually file about now" is the whole
 * distinction this screen has to preserve.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useGoBack } from '@/nav/useGoBack';
import {
  ErrorState,
  Fill,
  HeaderBar,
  Pill,
  PillRow,
  Placeholder,
  Screen,
  SheetCard,
  Text,
  colors,
  radius,
  space,
} from '@/ui';
import { useAsync } from '@/data/useAsync';
import { system } from '@/data/system';

/** The tokenized equities, which are the only symbols EDGAR can answer for. */
const EQUITIES = ['NVDAc', 'AAPLc', 'TSLAc', 'METAc', 'MSFTc', 'AMZNc', 'GOOGLc', 'MSTRc'] as const;

const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export default function Earnings() {
  const goBack = useGoBack();
  const [symbol, setSymbol] = useState<string>(EQUITIES[0]);
  const { data, loading, error, reload } = useAsync(() => system.earnings(symbol), [symbol]);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={goBack} title={<Text variant="screenTitle">Earnings</Text>} />
        <Text variant="secondary" color={colors.ink40} style={{ marginTop: space.s8 }}>
          Filing dates from EDGAR, and what the cadence implies about the next one.
        </Text>
      </View>

      <PillRow style={{ marginTop: space.s14 }} contentPadding={space.gutter}>
        {EQUITIES.map((s) => (
          <Pill key={s} label={s} selected={s === symbol} onPress={() => setSymbol(s)} />
        ))}
      </PillRow>

      <Fill style={{ marginTop: space.s12, paddingHorizontal: space.gutter }}>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Placeholder height={160} />
        ) : !data ? null : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.s30, gap: space.s10 }}
          >
            <SheetCard bordered borderRadius={radius.panel} padding={space.s18}>
              <Text variant="footnote" color={colors.ink40}>
                PROJECTED NEXT
              </Text>
              {/*
                Amber, not white, and the word "projected" carries the weight. This is the only
                date on the screen nobody has filed.
              */}
              <Text
                variant="screenTitle"
                color={data.nextAt ? colors.warn : colors.ink40}
                style={{ marginTop: space.s6 }}
              >
                {data.nextAt ? day(data.nextAt) : 'Not projectable'}
              </Text>
              <Text variant="secondary" color={colors.ink65} style={{ marginTop: space.s10 }}>
                {data.nextAt
                  ? `A projection from this company's own filing cadence, give or take ${data.errorDays} days. Nobody has filed this.`
                  : 'The gaps between filings are not a cadence this recognises, so no date is offered rather than a guessed one.'}
              </Text>
              {data.medianGapDays ? (
                <Text variant="footnote" color={colors.ink28} style={{ marginTop: space.s8 }}>
                  Median gap {data.medianGapDays} days · CIK {data.cik}
                </Text>
              ) : null}
            </SheetCard>

            <SheetCard bordered borderRadius={radius.panel} padding={space.s16}>
              <Text variant="footnote" color={colors.ink40}>
                FILED
              </Text>
              {data.reported.length === 0 ? (
                <Text variant="secondarySm" color={colors.ink40} style={{ marginTop: space.s8 }}>
                  EDGAR returned no filings.
                </Text>
              ) : (
                data.reported.slice(0, 10).map((at, i) => (
                  <View
                    key={at}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: space.s10,
                    }}
                  >
                    <Text variant="secondarySm" color={colors.ink65}>
                      {day(at)}
                    </Text>
                    {/* The gap that came after this filing — the evidence for the projection. */}
                    {data.gapDays[i] === undefined ? null : (
                      <Text variant="secondarySm" color={colors.ink40}>
                        {data.gapDays[i]} days
                      </Text>
                    )}
                  </View>
                ))
              )}
            </SheetCard>
          </ScrollView>
        )}
      </Fill>
    </Screen>
  );
}
