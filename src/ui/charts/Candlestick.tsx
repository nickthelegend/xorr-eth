/**
 * Candlestick.tsx — the centrepiece.
 *
 * design.md §6, per candle:
 *   Wick  width 1.6 · radius 2 · opacity .75–.8 · colour = body colour
 *   Body  full column width · radius 3 · candleUp / candleDown · box-shadow bloom
 *
 * Nothing here is hand-placed. The component takes OHLC in **price space** and a
 * `projection` — tight for the pro chart, wide for Auto Close — measures the box it was
 * given, and multiplies the projected percentages by that. Change the height and every
 * candle moves correctly; change the TP price and the wide projection re-brackets itself.
 *
 * The bloom is `0 0 10px rgba(22,192,96,.35)` up / `rgba(239,59,54,.32)` down. It is a
 * glow, not a shadow, and §3 says it is what makes the charts read as premium. In SVG
 * that is an `feDropShadow` with no offset and `stdDeviation` = blur / 2, which is the
 * CSS-to-SVG conversion for a blur radius.
 *
 * animations.md: candles are **not animated**. No draw-on, no grow-from-baseline. The
 * chart is data; it renders complete, and a live update mutates the last candle in place.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, FeDropShadow, Filter, G, Line, Rect } from 'react-native-svg';
import { Value } from '../Text';
import { type as typeScale } from '../type';
import { chart, colors, radius, space } from '../tokens';
import { Press } from '../Press';
import { columns, useMeasuredBox } from './useMeasuredBox';
import { axisLabels, projectSeries, toPct, type Candle, type Projection } from './projection';

/** CSS `blur(N)` in a box-shadow is twice the Gaussian σ. */
const BLUR_TO_STD_DEVIATION = 0.5;
const BLOOM_BLUR = 10;
const BLOOM_OPACITY_UP = 0.35;
const BLOOM_OPACITY_DOWN = 0.32;
/** Room for the glow to spill outside each candle's own bounds. */
const FILTER_MARGIN = '-50%';
const FILTER_SPAN = '200%';
/** The axis gutter on the right of the plot, from the prototype. */
const AXIS_WIDTH = chart.axisWidth;

/** How far an unselected candle steps back. Enough to recede, not enough to vanish. */
const DIMMED = 0.35;
/** The last-price chip's own height, derived from its variant rather than measured. */
const CHIP_HEIGHT = typeScale.chip.lineHeight + space.s2 * 2;

export interface CandlestickProps {
  series: readonly Candle[];
  /** Tight (pro chart) or wide (Auto Close). Build it with `tightProjection` / `wideProjection`. */
  projection: Projection;
  /** Plot height. The width comes from the layout. */
  height: number;
  /** Draw the derived price axis down the right-hand gutter. */
  showAxis?: boolean;
  /**
   * Horizontal rules behind the candles, at the same 25% intervals the area chart uses.
   * screens.md asks for them on the pro chart; design.md §6 does not put them in the candle
   * recipe, so they are opt-in rather than the default.
   */
  grid?: boolean;
  /** Formats an axis price. Defaults to `12.3K`. */
  formatAxis?: (price: number) => string;
  /** The dashed last-price rule and its chip. Pass the already-formatted label. */
  lastPrice?: { value: number; label: string };
  /** The chip sits on the left when a TP chip already occupies the right edge. */
  lastPriceSide?: 'left' | 'right';
  /** Renders in the light sheet: the rule and chip invert. */
  light?: boolean;
  /**
   * Which bar the user has tapped, if any — and how to tell the screen it changed.
   *
   * The chart was read-only: you could see the shape and never the open, high, low or close
   * of a single candle, even though the data was already loaded. Selecting dims the rest, so
   * the chosen bar is unmistakable, and the screen shows its numbers.
   *
   * Omit `onSelect` and the chart stays inert — no touch targets, no dimming.
   */
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Candlestick({
  series,
  projection,
  height,
  showAxis = false,
  grid = false,
  formatAxis,
  lastPrice,
  lastPriceSide = 'right',
  light = false,
  selected = null,
  onSelect,
  style,
  testID,
}: CandlestickProps) {
  const [box, onLayout] = useMeasuredBox();
  /* Filter ids share a namespace across every SVG on screen, so two charts on one screen
     would otherwise fight over `candle-bloom-up`. */
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const bloomUp = `candle-up-${uid}`;
  const bloomDown = `candle-down-${uid}`;

  /* With no data there is nothing to project. Drawing an axis anyway would put a price
     scale on the screen that no price produced — on a trading surface an invented axis is
     worse than an empty box. */
  const hasData = series.length > 0;
  const plotWidth = Math.max(0, box.width - (showAxis ? AXIS_WIDTH : 0));
  /** Everything except the chosen candle steps back, so the selection is unmistakable. */
  const dimmed = (i: number) => selected !== null && selected !== i;
  const geometry = projectSeries(projection, series);
  const { columnWidth, xOf } = columns(plotWidth, series.length, chart.candle.gap);
  const pxOf = (pct: number) => (pct / 100) * height;

  const lastTop = lastPrice ? pxOf(toPct(projection, lastPrice.value)) : 0;
  const ruleInk = light ? chart.candle.markInkSheet : chart.candle.markInk;
  const wickOpacity = light ? chart.candle.wickOpacitySheet : chart.candle.wickOpacity;

  return (
    <View testID={testID} style={[{ height }, style]} onLayout={onLayout}>
      {/*
        The touch layer sits ABOVE the SVG rather than inside it: react-native-svg's press
        handling differs between native and web, and a chart the user cannot tap on the web
        demo is a chart with no readout. One transparent target per column, sized and placed
        from the same `columns()` geometry the candles use, so they cannot drift apart.
      */}
      {box.width > 0 && hasData && (
        <>
          <Svg width={box.width} height={height}>
            <Defs>
              <Filter
                id={bloomUp}
                x={FILTER_MARGIN}
                y={FILTER_MARGIN}
                width={FILTER_SPAN}
                height={FILTER_SPAN}
              >
                <FeDropShadow
                  dx={0}
                  dy={0}
                  stdDeviation={BLOOM_BLUR * BLUR_TO_STD_DEVIATION}
                  floodColor={colors.candleUp}
                  floodOpacity={BLOOM_OPACITY_UP}
                />
              </Filter>
              <Filter
                id={bloomDown}
                x={FILTER_MARGIN}
                y={FILTER_MARGIN}
                width={FILTER_SPAN}
                height={FILTER_SPAN}
              >
                <FeDropShadow
                  dx={0}
                  dy={0}
                  stdDeviation={BLOOM_BLUR * BLUR_TO_STD_DEVIATION}
                  floodColor={colors.candleDown}
                  floodOpacity={BLOOM_OPACITY_DOWN}
                />
              </Filter>
            </Defs>

            {grid
              ? chart.area.gridAt.map((t) => (
                  <Line
                    key={`grid-${t}`}
                    x1={0}
                    x2={plotWidth}
                    y1={height * t}
                    y2={height * t}
                    stroke={light ? colors.sheet.tick : chart.area.gridColor}
                    strokeWidth={1}
                  />
                ))
              : null}

            {geometry.map((g, i) => {
              const colour = g.up ? colors.candleUp : colors.candleDown;
              const x = xOf(i);
              const centre = x + columnWidth / 2;

              return (
                <G key={i} opacity={dimmed(i) ? DIMMED : 1}>
                  <Rect
                    x={centre - chart.candle.wickWidth / 2}
                    y={pxOf(g.wickTopPct)}
                    width={chart.candle.wickWidth}
                    height={Math.max(0, pxOf(g.wickHeightPct))}
                    rx={chart.candle.wickRadius}
                    fill={colour}
                    opacity={wickOpacity}
                  />
                  <Rect
                    x={x}
                    y={pxOf(g.bodyTopPct)}
                    width={columnWidth}
                    height={pxOf(g.bodyHeightPct)}
                    rx={chart.candle.bodyRadius}
                    fill={colour}
                    filter={g.up ? `url(#${bloomUp})` : `url(#${bloomDown})`}
                  />
                </G>
              );
            })}

            {lastPrice && (
              <Line
                x1={0}
                y1={lastTop}
                x2={plotWidth}
                y2={lastTop}
                stroke={ruleInk}
                strokeWidth={chart.candle.markStroke}
                strokeDasharray={[...chart.candle.markDash]}
              />
            )}
          </Svg>

          {onSelect && box.width > 0 && hasData ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {geometry.map((_, i) => (
                <Press
                  key={`hit-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Candle ${i + 1} of ${geometry.length}`}
                  accessibilityState={{ selected: selected === i }}
                  onPress={() => onSelect(selected === i ? null : i)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    height,
                    left: xOf(i),
                    width: columnWidth + chart.candle.gap,
                  }}
                />
              ))}
            </View>
          ) : null}

          {showAxis && (
            <View
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: AXIS_WIDTH,
                justifyContent: 'space-between',
                paddingLeft: space.s8,
                pointerEvents: 'none',
              }}
            >
              {/* Keyed by index, not by the label: a flat series projects every tick to
                  the same price, so the five labels are the same string. */}
              {axisLabels(projection, formatAxis).map((label, i) => (
                <Value
                  key={i}
                  variant="chipSm"
                  color={light ? colors.sheet.dim : colors.ink30}
                >
                  {label}
                </Value>
              ))}
            </View>
          )}

          {lastPrice && (
            <View
              style={{
                position: 'absolute',
                /* Centre the chip on the rule. The offset is half the chip's own height,
                   computed from its variant — nothing is measured and nothing is guessed. */
                top: lastTop - CHIP_HEIGHT / 2,
                left: lastPriceSide === 'left' ? space.s16 : undefined,
                right: lastPriceSide === 'right' ? 0 : undefined,
                backgroundColor: light ? colors.sheet.ink : colors.ink,
                borderRadius: light ? radius.square : radius.glyph,
                paddingVertical: space.s2,
                paddingHorizontal: space.s6,
                pointerEvents: 'none',
              }}
            >
              <Value variant="chip" color={light ? colors.sheet.bg : colors.bg}>
                {lastPrice.label}
              </Value>
            </View>
          )}
        </>
      )}
    </View>
  );
}
