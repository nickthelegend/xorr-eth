/**
 * One screen failing must not take the app down.
 *
 * Lives in `src/errors/`, not `src/app/`. expo-router scans for routes by directory name and
 * treated `src/app/ErrorBoundary.tsx` as a route file — it has no default export, so the router
 * refused to build its tree at all and EVERY route in the app became "Unmatched Route". A
 * directory called `app` anywhere in the source tree is a trap.
 *
 * React unmounts the whole tree when a render throws, so a single bad value anywhere — a null
 * where a number was expected, a malformed row from an endpoint — replaced the entire app with a
 * blank screen. On a trading app that is the worst possible failure mode: the user cannot see
 * their balance, cannot reach the safety screen, and cannot stop the bot.
 *
 * So the boundary wraps each screen rather than the app. The tab bar keeps working, the kill
 * switch stays reachable, and the failure is confined to the one thing that broke.
 *
 * It shows the error rather than a friendly nothing. This codebase's standing position is that a
 * server which hides its errors is worse than one that fails, and the same is true here — a person
 * who can read "Cannot read properties of null" can tell us what happened; a person looking at
 * "Something went wrong" cannot.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ink, pnl, surfaces } from '@/design/colors';
import { radius } from '@/design/space';
import { type } from '@/design/type';

/**
 * The shape expo-router hands a layout's `ErrorBoundary` export.
 *
 * Exporting this from a `_layout.tsx` scopes the boundary to that segment — which is the whole
 * point: a failing tab screen keeps the tab bar, so the user can still reach Safety and stop the
 * bot. A boundary at the root would catch the same error and take the navigation down with it.
 */
export function ScreenError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: surfaces.bg, padding: 20, justifyContent: 'center' }}>
      <View
        style={{ backgroundColor: surfaces.surface, borderRadius: radius.xl, padding: 18, gap: 10 }}
      >
        <Text style={[type.cardTitle, { color: pnl.down }]}>This screen could not render.</Text>
        <Text style={[type.body, { color: ink.i45 }]}>
          The rest of the app is unaffected — your balance, your permission and the stop button all
          still work.
        </Text>
        <ScrollView style={{ maxHeight: 140 }}>
          {/*
            The real message, not a friendly nothing.
            This codebase's standing position is that a server which hides its errors is worse than
            one that fails, and it applies here too: someone who can read "Cannot read properties
            of null" can tell us what happened, and someone looking at "Something went wrong"
            cannot.
          */}
          <Text style={[type.footnote, { color: ink.i32 }]} selectable>
            {error.message}
          </Text>
        </ScrollView>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Try this screen again"
          style={({ pressed }) => ({
            marginTop: 4,
            height: 44,
            borderRadius: radius.xl,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? 'rgba(255,255,255,0.88)' : ink.full,
          })}
        >
          <Text style={[type.buttonLabel, { color: '#0B0B0B' }]}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}
