/**
 * @fileoverview Random full-page purple/blue shell atmosphere.
 *
 * Sets CSS variables consumed by `.shell-atmosphere` so each full page load
 * gets a different lobe layout (not a fixed half-purple / half-blue split).
 *
 * Always write ``--shell-glow-*`` on ``document.documentElement`` via
 * ``setProperty`` — never on ``.shell-atmosphere`` and never via ``cssText``.
 */

/** Corner quadrants (percent space) for the four glow lobes. */
export interface GlowQuadrant {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Number of shell glow lobes (matches ``--shell-glow-1``…``4`` in CSS). */
export const SHELL_GLOW_LOBE_COUNT = 4;

/** Color token refs assigned to lobes (two purple + two blue, then shuffled). */
export const SHELL_GLOW_COLOR_TOKENS = [
  'var(--bg-glow-purple)',
  'var(--bg-glow-purple)',
  'var(--bg-glow-blue)',
  'var(--bg-glow-blue)',
] as const;

/** Fixed corner bands used as lobe position ranges (percent). */
export const SHELL_GLOW_QUADRANTS: readonly GlowQuadrant[] = [
  { x0: 0, x1: 48, y0: 0, y1: 48 },
  { x0: 52, x1: 100, y0: 0, y1: 48 },
  { x0: 52, x1: 100, y0: 52, y1: 100 },
  { x0: 0, x1: 48, y0: 52, y1: 100 },
];

/** Minimum radial size percent before random span. */
export const SHELL_GLOW_SIZE_MIN = 88;

/** Random span added to {@link SHELL_GLOW_SIZE_MIN}. */
export const SHELL_GLOW_SIZE_SPAN = 52;

/** Minimum gradient stop percent before random span. */
export const SHELL_GLOW_STOP_MIN = 50;

/** Random span added to {@link SHELL_GLOW_STOP_MIN}. */
export const SHELL_GLOW_STOP_SPAN = 20;

/** ``window`` flag so ``pageshow`` is bound once across script re-runs. */
export const SHELL_ATMOSPHERE_BIND_FLAG = '__apertureShellAtmosphereBound';

export type ShellAtmosphereRandom = () => number;

/** Computed ``--shell-glow-*`` custom properties for one random layout. */
export type ShellAtmosphereStyleProps = Record<string, string>;

function shuffleInPlace<T>(items: T[], random: ShellAtmosphereRandom): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

/**
 * Pure layout generator — algorithm source of truth for shell atmosphere.
 *
 * ``random`` must return values in ``[0, 1)`` (same contract as ``Math.random``).
 */
export function computeShellAtmosphereStyleProps(
  random: ShellAtmosphereRandom = Math.random,
): ShellAtmosphereStyleProps {
  const lobes = SHELL_GLOW_QUADRANTS.map((q) => ({ ...q }));
  shuffleInPlace(lobes, random);

  const colors = [...SHELL_GLOW_COLOR_TOKENS];
  shuffleInPlace(colors, random);

  const props: ShellAtmosphereStyleProps = {};
  for (let n = 0; n < SHELL_GLOW_LOBE_COUNT; n++) {
    const q = lobes[n]!;
    const x = q.x0 + random() * (q.x1 - q.x0);
    const y = q.y0 + random() * (q.y1 - q.y0);
    const size = SHELL_GLOW_SIZE_MIN + random() * SHELL_GLOW_SIZE_SPAN;
    const stop = SHELL_GLOW_STOP_MIN + random() * SHELL_GLOW_STOP_SPAN;
    const idx = n + 1;
    props[`--shell-glow-${idx}-x`] = `${x.toFixed(1)}%`;
    props[`--shell-glow-${idx}-y`] = `${y.toFixed(1)}%`;
    props[`--shell-glow-${idx}-size`] = `${size.toFixed(1)}%`;
    props[`--shell-glow-${idx}-stop`] = `${stop.toFixed(1)}%`;
    props[`--shell-glow-${idx}-color`] = colors[n]!;
  }
  return props;
}

/**
 * Apply a fresh random lobe layout via ``setProperty`` on ``root``.
 *
 * Production call sites should pass ``document.documentElement`` (the default).
 */
export function applyRandomShellAtmosphere(
  root: {
    style: { setProperty: (name: string, value: string) => void };
  } = document.documentElement,
  random: ShellAtmosphereRandom = Math.random,
): void {
  const props = computeShellAtmosphereStyleProps(random);
  for (const [name, value] of Object.entries(props)) {
    root.style.setProperty(name, value);
  }
}

/**
 * Build the ``beforeInteractive`` IIFE from shared constants + one algorithm
 * template (pageshow bfcache re-roll + global bind guard included).
 */
export function buildShellAtmosphereRandomizeScript(): string {
  const lobesLiteral = JSON.stringify(SHELL_GLOW_QUADRANTS);
  const colorsLiteral = JSON.stringify([...SHELL_GLOW_COLOR_TOKENS]);
  const bindFlagLiteral = JSON.stringify(SHELL_ATMOSPHERE_BIND_FLAG);

  return `(() => {
  var BIND_FLAG = ${bindFlagLiteral};
  function shuffle(items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }
  function apply() {
    try {
      var root = document.documentElement;
      var lobes = ${lobesLiteral}.slice();
      shuffle(lobes);
      var colors = ${colorsLiteral}.slice();
      shuffle(colors);
      for (var n = 0; n < ${SHELL_GLOW_LOBE_COUNT}; n++) {
        var q = lobes[n];
        var x = q.x0 + Math.random() * (q.x1 - q.x0);
        var y = q.y0 + Math.random() * (q.y1 - q.y0);
        var size = ${SHELL_GLOW_SIZE_MIN} + Math.random() * ${SHELL_GLOW_SIZE_SPAN};
        var stop = ${SHELL_GLOW_STOP_MIN} + Math.random() * ${SHELL_GLOW_STOP_SPAN};
        var idx = n + 1;
        root.style.setProperty('--shell-glow-' + idx + '-x', x.toFixed(1) + '%');
        root.style.setProperty('--shell-glow-' + idx + '-y', y.toFixed(1) + '%');
        root.style.setProperty(
          '--shell-glow-' + idx + '-size',
          size.toFixed(1) + '%'
        );
        root.style.setProperty(
          '--shell-glow-' + idx + '-stop',
          stop.toFixed(1) + '%'
        );
        root.style.setProperty('--shell-glow-' + idx + '-color', colors[n]);
      }
    } catch (e) {}
  }
  apply();
  try {
    if (!window[BIND_FLAG]) {
      window[BIND_FLAG] = true;
      window.addEventListener('pageshow', function (event) {
        if (!event.persisted) return;
        apply();
      });
    }
  } catch (e) {}
})();`;
}

/**
 * Inline IIFE for root layout ``beforeInteractive`` — generated from
 * {@link buildShellAtmosphereRandomizeScript} (same constants as
 * {@link computeShellAtmosphereStyleProps}).
 */
export const SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT =
  buildShellAtmosphereRandomizeScript();
