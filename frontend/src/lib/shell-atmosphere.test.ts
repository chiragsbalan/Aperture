import { describe, expect, it } from 'vitest';

import {
  SHELL_ATMOSPHERE_BIND_FLAG,
  SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT,
  SHELL_GLOW_COLOR_TOKENS,
  SHELL_GLOW_LOBE_COUNT,
  SHELL_GLOW_QUADRANTS,
  SHELL_GLOW_SIZE_MIN,
  SHELL_GLOW_SIZE_SPAN,
  SHELL_GLOW_STOP_MIN,
  SHELL_GLOW_STOP_SPAN,
  applyRandomShellAtmosphere,
  buildShellAtmosphereRandomizeScript,
  computeShellAtmosphereStyleProps,
} from './shell-atmosphere';

/** Deterministic ``[0, 1)`` stream for seeded shuffle / position tests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

describe('computeShellAtmosphereStyleProps', () => {
  it('emits all lobe custom properties for a seeded rng', () => {
    const props = computeShellAtmosphereStyleProps(seededRandom(42));
    for (let idx = 1; idx <= SHELL_GLOW_LOBE_COUNT; idx++) {
      expect(props[`--shell-glow-${idx}-x`]).toMatch(/^\d+(\.\d)?%$/);
      expect(props[`--shell-glow-${idx}-y`]).toMatch(/^\d+(\.\d)?%$/);
      expect(props[`--shell-glow-${idx}-size`]).toMatch(/^\d+(\.\d)?%$/);
      expect(props[`--shell-glow-${idx}-stop`]).toMatch(/^\d+(\.\d)?%$/);
      expect(SHELL_GLOW_COLOR_TOKENS).toContain(
        props[`--shell-glow-${idx}-color`],
      );
    }
    expect(Object.keys(props)).toHaveLength(SHELL_GLOW_LOBE_COUNT * 5);
  });

  it('is deterministic for the same seed', () => {
    const a = computeShellAtmosphereStyleProps(seededRandom(7));
    const b = computeShellAtmosphereStyleProps(seededRandom(7));
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = computeShellAtmosphereStyleProps(seededRandom(1));
    const b = computeShellAtmosphereStyleProps(seededRandom(2));
    expect(a).not.toEqual(b);
  });

  it('assigns exactly two purple and two blue color tokens', () => {
    const props = computeShellAtmosphereStyleProps(seededRandom(99));
    const colors = [1, 2, 3, 4].map(
      (idx) => props[`--shell-glow-${idx}-color`],
    );
    const purple = colors.filter((c) => c === 'var(--bg-glow-purple)');
    const blue = colors.filter((c) => c === 'var(--bg-glow-blue)');
    expect(purple).toHaveLength(2);
    expect(blue).toHaveLength(2);
  });

  it('keeps size and stop within configured ranges', () => {
    const props = computeShellAtmosphereStyleProps(seededRandom(123));
    for (let idx = 1; idx <= SHELL_GLOW_LOBE_COUNT; idx++) {
      const size = Number.parseFloat(props[`--shell-glow-${idx}-size`]!);
      const stop = Number.parseFloat(props[`--shell-glow-${idx}-stop`]!);
      expect(size).toBeGreaterThanOrEqual(SHELL_GLOW_SIZE_MIN);
      expect(size).toBeLessThan(SHELL_GLOW_SIZE_MIN + SHELL_GLOW_SIZE_SPAN);
      expect(stop).toBeGreaterThanOrEqual(SHELL_GLOW_STOP_MIN);
      expect(stop).toBeLessThan(SHELL_GLOW_STOP_MIN + SHELL_GLOW_STOP_SPAN);
    }
  });
});

describe('applyRandomShellAtmosphere', () => {
  it('writes only via setProperty (never cssText)', () => {
    const setPropertyCalls: Array<[string, string]> = [];
    const root = {
      style: {
        setProperty(name: string, value: string) {
          setPropertyCalls.push([name, value]);
        },
      },
    };
    applyRandomShellAtmosphere(root, seededRandom(3));
    expect(setPropertyCalls.length).toBe(SHELL_GLOW_LOBE_COUNT * 5);
    for (const [name] of setPropertyCalls) {
      expect(name.startsWith('--shell-glow-')).toBe(true);
    }
    const expected = computeShellAtmosphereStyleProps(seededRandom(3));
    expect(Object.fromEntries(setPropertyCalls)).toEqual(expected);
  });
});

describe('buildShellAtmosphereRandomizeScript / sync lock', () => {
  const script = SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT;

  it('matches a fresh buildShellAtmosphereRandomizeScript() call', () => {
    expect(script).toBe(buildShellAtmosphereRandomizeScript());
  });

  it('targets document.documentElement and uses setProperty only', () => {
    expect(script).toContain('document.documentElement');
    expect(script).toContain('setProperty');
    expect(script).not.toContain('cssText');
    expect(script).not.toContain('.shell-atmosphere');
  });

  it('embeds shared constants (lobes, colors, ranges, bind flag)', () => {
    expect(script).toContain(JSON.stringify(SHELL_GLOW_QUADRANTS));
    expect(script).toContain(JSON.stringify([...SHELL_GLOW_COLOR_TOKENS]));
    expect(script).toContain(`n < ${SHELL_GLOW_LOBE_COUNT}`);
    expect(script).toContain(String(SHELL_GLOW_SIZE_MIN));
    expect(script).toContain(String(SHELL_GLOW_SIZE_SPAN));
    expect(script).toContain(String(SHELL_GLOW_STOP_MIN));
    expect(script).toContain(String(SHELL_GLOW_STOP_SPAN));
    expect(script).toContain(JSON.stringify(SHELL_ATMOSPHERE_BIND_FLAG));
    for (const token of SHELL_GLOW_COLOR_TOKENS) {
      expect(script).toContain(token);
    }
  });

  it('binds pageshow only when event.persisted (with global bind guard)', () => {
    expect(script).toContain("addEventListener('pageshow'");
    expect(script).toContain('event.persisted');
    expect(script).toContain(
      `var BIND_FLAG = ${JSON.stringify(SHELL_ATMOSPHERE_BIND_FLAG)}`,
    );
    // Guard: only attach when flag is unset.
    expect(script).toMatch(/if\s*\(\s*!window\[BIND_FLAG\]\s*\)/);
    expect(script).toContain('window[BIND_FLAG] = true');
  });

  it('eval apply path matches computeShellAtmosphereStyleProps for a seed', () => {
    const setPropertyCalls: Array<[string, string]> = [];
    const random = seededRandom(55);
    const randomForCompute = seededRandom(55);

    // Minimal DOM stub for the generated apply() body.
    const fakeWindow: {
      [key: string]: unknown;
      addEventListener: (
        type: string,
        listener: (event: {persisted: boolean}) => void,
      ) => void;
    } = {
      addEventListener() {
        // ignore bind in this sync check
      },
    };
    const fakeDocument = {
      documentElement: {
        style: {
          setProperty(name: string, value: string) {
            setPropertyCalls.push([name, value]);
          },
        },
      },
    };

    const originalRandom = Math.random;
    const originalWindow = (globalThis as {window?: unknown}).window;
    const originalDocument = (globalThis as {document?: unknown}).document;
    try {
      Math.random = random;
      (globalThis as {window: unknown}).window = fakeWindow;
      (globalThis as {document: unknown}).document = fakeDocument;

      // Run only the apply() definition + one call from the generated script.
      // Strip the outer IIFE wrapper and invoke apply once without pageshow.
      const body = script
        .replace(/^\(\(\)\s*=>\s*\{/, '')
        .replace(/\}\)\(\);\s*$/, '');
      const applyOnly = new Function(`
        var window = globalThis.window;
        var document = globalThis.document;
        ${body}
        // IIFE already called apply(); properties are on the stub.
      `);
      applyOnly();
    } finally {
      Math.random = originalRandom;
      if (originalWindow === undefined) {
        delete (globalThis as {window?: unknown}).window;
      } else {
        (globalThis as {window: unknown}).window = originalWindow;
      }
      if (originalDocument === undefined) {
        delete (globalThis as {document?: unknown}).document;
      } else {
        (globalThis as {document: unknown}).document = originalDocument;
      }
    }

    const expected = computeShellAtmosphereStyleProps(randomForCompute);
    expect(Object.fromEntries(setPropertyCalls)).toEqual(expected);
  });
});
