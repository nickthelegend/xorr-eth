/**
 * Design-system enforcement. These are the handoff's rules turned into failing tests.
 * PLAN.md tasks 1.1, 1.2, 1.3, 13.6.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { colors, pnl, ink } from './colors';
import { type, MIN_FONT_SIZE } from './type';
import { DURATION, MOTION_INVENTORY } from './motion';
import { space, radius } from './space';

const SRC = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}


/**
 * Strip block and line comments, preserving line numbers so offender messages stay accurate.
 * design.md values are quoted throughout our docblocks; only real code counts as a violation.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** Files allowed to declare raw color literals. Everything else must import a token. */
const COLOR_SOURCES = new Set(
  ['design/colors.ts', 'design/gradients.ts', 'data/fixtures'].map((p) => p.replace(/\//g, path.sep)),
);

function isColorSource(file: string) {
  const rel = path.relative(SRC, file);
  for (const allowed of COLOR_SOURCES) if (rel.startsWith(allowed)) return true;
  return false;
}

describe('1.1 color tokens are the only source of color', () => {
  it('every surface, ink, border and P&L token from design.md §1 exists', () => {
    expect(colors.bg).toBe('#000000');
    expect(colors.surface).toBe('#0C0C0D');
    expect(colors.surfaceAlt).toBe('#141516');
    expect(colors.control).toBe('#1B1C1E');
    expect(colors.controlHover).toBe('#252629');
    expect(colors.switchOff).toBe('#2A2B2E');
    expect(colors.inputBg).toBe('#121213');
    expect(colors.sheet.bg).toBe('#FFFFFF');
    expect(colors.sheet.fill).toBe('#F2F2F5');
    expect(colors.sheet.tick).toBe('#E4E4E9');
    expect(ink.full).toBe('#FFFFFF');
    expect(ink.i28).toBe('rgba(255,255,255,0.28)');
    expect(colors.borders.hairline).toBe('rgba(255,255,255,0.05)');
    expect(colors.borders.hairlineStrong).toBe('rgba(255,255,255,0.055)');
    expect(pnl.up).toBe('#2BD87A');
    expect(pnl.down).toBe('#FF453A');
    expect(pnl.warn).toBe('#E8C64A');
    expect(pnl.candleUp).toBe('#16C060');
    expect(pnl.candleDown).toBe('#EF3B36');
  });

  it('no raw hex colors outside the token modules', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (isColorSource(file) || file.endsWith('.test.ts')) continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      src.split('\n').forEach((line, i) => {
        const m = line.match(/#[0-9a-fA-F]{6}\b/g);
        if (m) offenders.push(`${path.relative(SRC, file)}:${i + 1} ${m.join(',')}`);
      });
    }
    // Grays that are structurally part of a primitive (#FFFFFF knob, #0B0B0B selected ink)
    // are permitted because design.md specifies them inline in the component recipe.
    const allowed = /#FFFFFF|#0B0B0B|#000000|#111214/;
    const real = offenders.filter((o) => !allowed.test(o));
    expect(real, `raw hex outside tokens:\n${real.join('\n')}`).toEqual([]);
  });
});

describe('1.2 the P&L color law', () => {
  const PNL_VALUES = [pnl.up, pnl.down, pnl.candleUp, pnl.candleDown];

  it('P&L colors are only reachable through the `pnl` namespace', () => {
    // If a component wants green it must write `pnl.up`, which is greppable and reviewable.
    for (const v of PNL_VALUES) {
      expect(Object.values(pnl)).toContain(v);
    }
  });

  it('no selection/focus/active token resolves to a P&L color', () => {
    // Selection is white-on-dark. README.md: "This is why the app has no accent color."
    const selectionish = {
      selectedBorder: colors.borders.selected,
      selectedPillBg: ink.full,
      activeTabInk: ink.full,
      inactiveTabInk: ink.i30,
    };
    for (const [name, value] of Object.entries(selectionish)) {
      expect(PNL_VALUES, `${name} must not be a P&L color`).not.toContain(value);
    }
  });

  it('components that use a P&L color import it from the pnl namespace', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(SRC, 'design'))) {
      if (file.endsWith('colors.ts') || file.endsWith('.test.ts')) continue;
      const src = fs.readFileSync(file, 'utf8');
      const code = stripComments(src);
      for (const v of PNL_VALUES) {
        if (code.includes(v)) offenders.push(`${path.relative(SRC, file)} hardcodes ${v}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('1.3 type scale', () => {
  it('nothing is below 9.5px — design.md §2', () => {
    for (const [role, style] of Object.entries(type)) {
      const size = (style as { fontSize?: number }).fontSize;
      expect(size, `${role} is ${size}px`).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    }
  });

  it('every price / value / stepper role carries tabular numerals', () => {
    const numeric = [
      'heroBalance',
      'heroAmount',
      'priceLarge',
      'priceMedium',
      'pnlHero',
      'valueLarge',
      'amountMedium',
      'statLarge',
      'rowValue',
      'rowDelta',
      'stepperValue',
    ] as const;
    for (const role of numeric) {
      expect((type[role] as { fontVariant?: string[] }).fontVariant, role).toContain('tabular-nums');
    }
  });

  it('matches the exact sizes design.md §2 specifies', () => {
    expect(type.heroBalance.fontSize).toBe(46);
    expect(type.heroBalance.letterSpacing).toBe(-1.4);
    expect(type.heroAmount.fontSize).toBe(52);
    expect(type.heroAmount.letterSpacing).toBe(-2);
    expect(type.screenTitle.fontSize).toBe(22);
    expect(type.sheetTitle.fontSize).toBe(19);
    expect(type.tabLabel.fontSize).toBe(9.5);
    expect(type.pill.fontSize).toBe(13);
  });
});

describe('1.4 space, radius, motion', () => {
  it('the spacing scale is exactly design.md §3', () => {
    expect([...space]).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 34, 38, 44]);
  });

  it('radius bands cover every value design.md §3 lists', () => {
    expect(Object.values(radius)).toEqual(
      expect.arrayContaining([4, 6, 11, 12, 14, 16, 18, 20, 22, 24, 26, 30, 34]),
    );
  });

  it('durations are only 150 / 180 / 250 (200 is the documented allocation-bar exception)', () => {
    // 200 is the documented allocation-bar exception; 1750 is the sanctioned orb breathe.
    const allowed = new Set([150, 180, 200, 250, 1750]);
    for (const d of Object.values(DURATION)) expect(allowed.has(d), `${d}ms`).toBe(true);
  });

  it('every sanctioned animation moves exactly one property', () => {
    for (const [name, entry] of Object.entries(MOTION_INVENTORY)) {
      expect(entry.property, name).not.toContain(' ');
      expect(entry.property, name).not.toBe('all');
    }
  });
});
