#!/usr/bin/env node
/**
 * Generates `src/ui/design/css/scales.generated.css` from the theme catalogue
 * in `src/ui/design/themes/themes.config.mjs` plus the Radix Colours data.
 *
 * Run with `yarn build:design-tokens`. The output IS committed — the build does
 * not run this — so the checked-in file must stay in step with the config; the
 * unit test `test/ui/design/scales.generated.test.ts` regenerates in memory and
 * fails if it has drifted.
 *
 * Nothing from @radix-ui/colors reaches the browser: this reads the package at
 * build time and writes plain custom properties.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { THEMES, STATUS_SCALES, DATA_SCALES, isBrightSolid } from '../src/ui/design/themes/themes.config.mjs';

const require = createRequire(import.meta.url);
const radix = require('@radix-ui/colors');

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_PATH = resolve(HERE, '../src/ui/design/css/scales.generated.css');

/** Steps of a status scale we actually expose — soft fill, border, solid, text. */
const STATUS_STEPS = [3, 4, 6, 9, 10, 11];

/**
 * Steps of a categorical data scale we expose. Fewer than a status scale: a
 * data hue tints a cell, outlines a chart series or colours a label, so it
 * needs a soft fill, a border, a solid and a text step — no hover ramp, because
 * nothing in this palette is an interactive element.
 */
const DATA_STEPS = [3, 6, 9, 11];

/** Radix export name for a scale in a given appearance. */
function scaleKey(name, appearance, alpha) {
  return `${name}${appearance === 'dark' ? 'Dark' : ''}${alpha ? 'A' : ''}`;
}

function readScale(name, appearance, alpha) {
  const key = scaleKey(name, appearance, alpha);
  const scale = radix[key];
  if (!scale) {
    throw new Error(`Unknown Radix scale "${key}" — check themes.config.mjs`);
  }
  return scale;
}

/**
 * `{ sand1: '#111110' }` -> `--ark-gray-1: #111110;` lines.
 *
 * Note the asymmetry in Radix's data: the EXPORT is appearance-tagged
 * (`sandDarkA`) but the keys inside it are not (`sandA1`), so the step lookup
 * uses the untagged prefix.
 */
function emitSteps(scale, scaleName, prefix, appearance, alpha, steps) {
  const sourcePrefix = `${scaleName}${alpha ? 'A' : ''}`;
  return steps.map((step) => {
    const value = scale[`${sourcePrefix}${step}`];
    if (!value) {
      throw new Error(`Missing step ${step} in ${sourcePrefix}`);
    }
    return `  --ark-${prefix}${alpha ? '-a' : '-'}${step}: ${value};`;
  });
}

const ALL_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function emitTheme(theme) {
  const { id, appearance, gray, accent } = theme;
  const lines = [];

  lines.push(`/* ${theme.label} — ${gray} / ${accent}, ${appearance} */`);
  lines.push(`[data-ark-theme="${id}"] {`);
  lines.push(`  color-scheme: ${appearance};`);
  lines.push(`  --ark-appearance: ${appearance};`);
  lines.push('');
  lines.push(`  /* neutral: ${gray} */`);
  lines.push(...emitSteps(readScale(gray, appearance, false), gray, 'gray', appearance, false, ALL_STEPS));
  lines.push(...emitSteps(readScale(gray, appearance, true), gray, 'gray', appearance, true, ALL_STEPS));
  lines.push('');
  lines.push(`  /* accent: ${accent} */`);
  lines.push(...emitSteps(readScale(accent, appearance, false), accent, 'accent', appearance, false, ALL_STEPS));
  lines.push(...emitSteps(readScale(accent, appearance, true), accent, 'accent', appearance, true, ALL_STEPS));
  lines.push(`  --ark-accent-contrast: ${isBrightSolid(accent) ? 'var(--ark-gray-1)' : '#fff'};`);
  lines.push('');
  lines.push('  /* status hues — fixed per appearance, never follow the accent */');
  for (const [role, scaleName] of Object.entries(STATUS_SCALES)) {
    const scale = readScale(scaleName, appearance, false);
    lines.push(...emitSteps(scale, scaleName, role, appearance, false, STATUS_STEPS));
    lines.push(
      `  --ark-${role}-contrast: ${isBrightSolid(scaleName) ? 'var(--ark-gray-1)' : '#fff'};`,
    );
  }
  lines.push('');
  lines.push('  /* categorical data hues — distinguishable, never a status */');
  DATA_SCALES.forEach((scaleName, index) => {
    const scale = readScale(scaleName, appearance, false);
    lines.push(...emitSteps(scale, scaleName, `data-${index + 1}`, appearance, false, DATA_STEPS));
    lines.push(
      `  --ark-data-${index + 1}-contrast: ${isBrightSolid(scaleName) ? 'var(--ark-gray-1)' : '#fff'};`,
    );
  });
  lines.push('');
  lines.push('  /* transparent blacks/whites for scrims and hover films */');
  const overlay = appearance === 'dark' ? radix.blackA : radix.blackA;
  for (const step of [3, 6, 8, 9, 11]) {
    lines.push(`  --ark-black-a${step}: ${overlay[`blackA${step}`]};`);
  }
  for (const step of [2, 3, 4, 6]) {
    lines.push(`  --ark-white-a${step}: ${radix.whiteA[`whiteA${step}`]};`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function generate() {
  const header = [
    '/*',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Source: src/ui/design/themes/themes.config.mjs + @radix-ui/colors',
    ' * Regenerate: yarn build:design-tokens',
    ' *',
    ' * Declares the raw colour steps for every theme. The semantic tokens that',
    ' * components actually use live in tokens.css and are written ONCE, in terms',
    ' * of these steps — see the step-role table there.',
    ' */',
    '',
  ].join('\n');

  const lightSelectors = THEMES.filter((t) => t.appearance === 'light')
    .map((t) => `[data-ark-theme="${t.id}"]`)
    .join(',\n');

  /* Appearance-level overrides. Derived from the config so tokens.css never has
     to name a theme: the alphas that read as depth over a dark surface read as
     dirt over a light one. */
  const lightBlock = lightSelectors
    ? [
        '',
        '',
        '/* Light appearances — softer scrim and shadows. */',
        `${lightSelectors} {`,
        '  --ark-bg-overlay: var(--ark-black-a6);',
        '  --ark-shadow-3: 0 12px 32px var(--ark-black-a6);',
        '  --ark-shadow-4: 0 24px 64px var(--ark-black-a8);',
        '}',
      ].join('\n')
    : '';

  return `${header}${THEMES.map(emitTheme).join('\n\n')}${lightBlock}\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const css = generate();
  const previous = (() => {
    try {
      return readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      return null;
    }
  })();
  writeFileSync(OUTPUT_PATH, css);
  const themeWord = THEMES.length === 1 ? 'theme' : 'themes';
  console.log(
    `${previous === css ? 'unchanged' : 'wrote'} ${OUTPUT_PATH} (${THEMES.length} ${themeWord})`,
  );
}
