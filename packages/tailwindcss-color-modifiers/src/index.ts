// src/index.ts
import plugin from 'tailwindcss/plugin';

export type ColorModifiersPluginOptions = {
  /**
   * When true, the plugin will emit console.warn messages for invalid modifiers.
   * Defaults to false (silent).
   */
  warn?: boolean;
};

type Channel = 'l' | 'c' | 'h' | 'a';
type Operation = '+' | '-' | '*' | '/';

type ParsedOp = {
  channel: Channel;
  operation: Operation;
  raw: string; // original token substring (for warnings)
  // For add/subtract on l/c/a: unitless numeric delta (already scaled if integer or %)
  // For multiply/divide: raw multiplier/divisor (NOT scaled)
  // For h: degrees (add/subtract), or multiplier/divisor
  value: number;
};

type ParsedModifier = {
  ops: ParsedOp[];
  // convenience: whether alpha is modified by any op
  hasAlphaOp: boolean;
};

function flattenColors(input: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;

  if (typeof input === 'string') {
    if (prefix) out[prefix] = input;
    return out;
  }

  if (typeof input !== 'object') return out;

  const obj = input as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    const nextPrefix = prefix ? `${prefix}-${key}` : key;

    if (typeof val === 'string') {
      out[nextPrefix] = val;
      continue;
    }

    // Special-case: { DEFAULT: "..." } should map to the parent key
    if (val && typeof val === 'object') {
      const maybeDefault = (val as Record<string, unknown>).DEFAULT;
      if (typeof maybeDefault === 'string') {
        out[nextPrefix] = maybeDefault;
      }
    }

    Object.assign(out, flattenColors(val, nextPrefix));
  }

  return out;
}

function isIntegerString(num: string): boolean {
  return /^[0-9]+$/.test(num);
}

function parseScaledLca(numStr: string): number | null {
  const trimmed = numStr.trim();
  const isPercent = trimmed.endsWith('%');
  const core = isPercent ? trimmed.slice(0, -1) : trimmed;

  // Must be a valid JS float (no exponent support needed for v1)
  if (!/^[0-9]*\.?[0-9]+$/.test(core)) return null;

  const n = Number(core);
  if (!Number.isFinite(n)) return null;

  if (isPercent) return n / 100;
  if (isIntegerString(core)) return n / 100;

  // decimal literal
  return n;
}

function parseHueDegrees(numStr: string): number | null {
  const trimmed = numStr.trim();
  if (trimmed.endsWith('%')) return null; // disallow % for hue
  if (!/^[0-9]*\.?[0-9]+$/.test(trimmed)) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n; // degrees
}

function normalizeModifier(mod: string): string {
  let m = mod.trim();

  // Strip surrounding brackets if present (e.g., "[l+2]" -> "l+2")
  // Tailwind v4 may pass arbitrary modifiers with brackets intact
  if (m.startsWith('[') && m.endsWith(']')) {
    m = m.slice(1, -1);
  }

  // Allow optional separators "_", ",", and " " (space) anywhere between tokens
  // Tailwind v4 may convert underscores to spaces, so we need to handle both
  return m.replaceAll('_', '').replaceAll(',', '').replaceAll(' ', '');
}

function parseModifier(
  modifierRaw: string,
  warn: (msg: string) => void,
): ParsedModifier | null {
  const modifier = normalizeModifier(modifierRaw);

  // quick reject: must start with a channel letter so we don't conflict with opacity modifiers like /50
  if (!/^[lchaLHCA]/.test(modifier)) return null;

  // reject unexpected characters early (helps avoid partial parsing surprises)
  // Allowed: letters l c h a (any case), p m x d (operation aliases), digits, +, -, *, /, ., %, separators already removed
  if (!/^[lchaLHCApmPMxdXD0-9+\-*/.%]+$/.test(modifier)) {
    warn(
      `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (unexpected characters).`,
    );
    return null;
  }

  // Token regex: <channel><operation?><number>
  // Operation options:
  //   - '+' or 'p'/'P' = add (plus)
  //   - '-' or 'm'/'M' = subtract (minus)
  //   - '*' or 'x'/'X' = multiply (times)
  //   - '/' or 'd'/'D' = divide
  //   - omitted = defaults to '+' (add)
  // This allows using l20, lp20, lx1.2, ld2, or bracket syntax [l+20], [l*1.2]
  // number: digits with optional decimal, optional % (only valid for l/c/a with +/-)
  const re = /([lchaLHCA])([+\-*/pmPMxdXD]?)([0-9]*\.?[0-9]+%?)/g;

  const ops: ParsedOp[] = [];
  let consumedUpto = 0;

  while (true) {
    const m = re.exec(modifier);
    if (!m) break;

    // Ensure contiguous consumption (no gaps)
    if (m.index !== consumedUpto) {
      warn(
        `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (parse gap at index ${consumedUpto}).`,
      );
      return null;
    }

    const channel = m[1].toLowerCase() as Channel;
    // Interpret operation: map letter aliases to symbols
    const rawOp = m[2].toLowerCase();
    let operation: Operation;
    if (rawOp === '-' || rawOp === 'm') {
      operation = '-';
    } else if (rawOp === '*' || rawOp === 'x') {
      operation = '*';
    } else if (rawOp === '/' || rawOp === 'd') {
      operation = '/';
    } else {
      operation = '+'; // default: +, p, or empty
    }
    const numStr = m[3];

    let value: number | null = null;
    const isMultiplyOrDivide = operation === '*' || operation === '/';

    if (channel === 'h') {
      value = parseHueDegrees(numStr);
      if (value == null) {
        warn(
          `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (invalid hue value "${numStr}").`,
        );
        return null;
      }
    } else if (isMultiplyOrDivide) {
      // For multiply/divide, don't auto-scale - use raw number
      // This allows lx1.2 to mean "L * 1.2", not "L * 0.012"
      const trimmed = numStr.trim();
      if (trimmed.endsWith('%')) {
        warn(
          `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (% not allowed with multiply/divide).`,
        );
        return null;
      }
      if (!/^[0-9]*\.?[0-9]+$/.test(trimmed)) {
        warn(
          `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (invalid ${channel.toUpperCase()} value "${numStr}").`,
        );
        return null;
      }
      value = Number(trimmed);
      if (!Number.isFinite(value)) {
        warn(
          `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (invalid ${channel.toUpperCase()} value "${numStr}").`,
        );
        return null;
      }
    } else {
      value = parseScaledLca(numStr);
      if (value == null) {
        warn(
          `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (invalid ${channel.toUpperCase()} value "${numStr}").`,
        );
        return null;
      }
    }

    ops.push({
      channel,
      operation,
      raw: m[0],
      value,
    });

    consumedUpto = re.lastIndex;
  }

  // Must consume the entire string and must have at least one op
  if (ops.length === 0 || consumedUpto !== modifier.length) {
    warn(
      `[tailwindcss-color-modifiers] Ignoring invalid modifier "/${modifierRaw}" (could not fully parse).`,
    );
    return null;
  }

  return {
    ops,
    hasAlphaOp: ops.some((o) => o.channel === 'a'),
  };
}

type CalcTerm = { operation: Operation; value: string };

function buildCalc(base: string, terms: CalcTerm[]): string {
  if (terms.length === 0) return base;

  // Group terms by operation type for cleaner output
  // Add/subtract can be chained: calc(L + 0.1 - 0.05)
  // Multiply/divide need separate calc or nested: calc(L * 1.2)
  // For simplicity, we'll build nested calcs for mixed operations
  // or single calc for same-type operations

  // If all operations are the same type and are +/-, we can chain them
  const allAddSub = terms.every(
    (t) => t.operation === '+' || t.operation === '-',
  );
  if (allAddSub) {
    const parts = terms.map((t) => `${t.operation} ${t.value}`);
    return `calc(${base} ${parts.join(' ')})`;
  }

  // For multiply/divide or mixed operations, apply them sequentially
  // Each operation wraps the previous result
  let result = base;
  for (const term of terms) {
    result = `calc(${result} ${term.operation} ${term.value})`;
  }
  return result;
}

function buildOklchFrom(baseColor: string, parsed: ParsedModifier): string {
  const lTerms: CalcTerm[] = [];
  const cTerms: CalcTerm[] = [];
  const hTerms: CalcTerm[] = [];
  const aTerms: CalcTerm[] = [];

  for (const op of parsed.ops) {
    const term: CalcTerm = { operation: op.operation, value: String(op.value) };
    if (op.channel === 'l') lTerms.push(term);
    if (op.channel === 'c') cTerms.push(term);
    if (op.channel === 'h') hTerms.push(term); // h is unitless degrees in oklch relative syntax
    if (op.channel === 'a') aTerms.push(term);
  }

  const L = buildCalc('L', lTerms);
  const C = buildCalc('C', cTerms);
  const H = buildCalc('h', hTerms);

  // Preserve alpha by default
  const A = aTerms.length === 0 ? 'alpha' : buildCalc('alpha', aTerms);

  return `oklch(from ${baseColor} ${L} ${C} ${H} / ${A})`;
}

function makeWarnFn(enabled: boolean): (msg: string) => void {
  if (!enabled) return () => {};
  return (msg: string) => {
    // eslint-disable-next-line no-console
    console.warn(msg);
  };
}

type Rule =
  | 'backgroundColor'
  | 'color'
  | 'borderColor'
  | 'outlineColor'
  | 'caretColor'
  | 'accentColor'
  | 'fill'
  | 'stroke'
  | 'textDecorationColor'
  | '--tw-ring-color'
  | '--tw-ring-offset-color'
  | '--tw-shadow-color'
  | '--tw-gradient-from'
  | '--tw-gradient-via'
  | '--tw-gradient-to';

// Use plugin.withOptions for proper @plugin directive support in Tailwind v4
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const colorModifiers: any = plugin.withOptions<ColorModifiersPluginOptions>(
  (options = {}) =>
    ({ matchUtilities, theme }) => {
      const warn = makeWarnFn(!!options.warn);
      const colors = flattenColors(theme('colors'));

      /**
       * Extract the actual color from a value that may be wrapped in color-mix().
       * In Tailwind v4, when using arbitrary modifiers like [l+2], the value comes
       * preprocessed as: color-mix(in <colorspace>, <color> <modifier-or-percent>, <fallback>)
       * We need to extract <color> to use with our oklch(from ...) syntax.
       *
       * This implementation is intentionally lenient to handle variations in:
       * - Color space (oklab, oklch, srgb, etc.)
       * - Trailing percentages or modifier strings
       * - Spacing variations
       *
       * @param value The value from Tailwind (may be wrapped in color-mix)
       */
      function extractColorFromValue(value: string): string | null {
        // Check if value is wrapped in color-mix()
        // Format: color-mix(in <colorspace>, <first-arg>, <second-arg>)
        const colorMixMatch = value.match(
          /^color-mix\(\s*in\s+\w+\s*,\s*(.+?)\s*,\s*.+\)$/,
        );

        if (colorMixMatch) {
          const firstArg = colorMixMatch[1].trim();

          // The first argument is "<color> <percentage-or-modifier>"
          // We need to extract just the color part.
          // Colors can be: #hex, rgb(...), oklch(...), color names, css vars, etc.

          // Strategy: find the last space-separated token that looks like a
          // modifier/percentage and remove it. Otherwise return as-is.

          // Handle oklch(...) or rgb(...) etc. by finding matching parens
          if (/^(?:oklch|rgb|hsl|lab|lch|color)\s*\(/.test(firstArg)) {
            // Find the closing paren of the color function
            let depth = 0;
            let colorEnd = 0;
            for (let i = 0; i < firstArg.length; i++) {
              if (firstArg[i] === '(') depth++;
              if (firstArg[i] === ')') {
                depth--;
                if (depth === 0) {
                  colorEnd = i + 1;
                  break;
                }
              }
            }
            if (colorEnd > 0) {
              return firstArg.slice(0, colorEnd).trim();
            }
          }

          // Handle hex colors or simple color names: strip trailing tokens
          // e.g., "#86efac l+2" -> "#86efac", "#000 50%" -> "#000"
          const parts = firstArg.split(/\s+/);
          if (parts.length > 1) {
            // Remove the last part (modifier or percentage)
            parts.pop();
            return parts.join(' ');
          }

          return firstArg;
        }

        // Return as-is if not wrapped in color-mix
        return value;
      }

      function buildRule(property: Rule) {
        return (
          value: string,
          ctx: { modifier: string | null },
        ): Record<string, string> => {
          const modifier = ctx.modifier;
          if (!modifier) return {};

          const parsed = parseModifier(modifier, warn);
          if (!parsed) return {};

          // Extract the actual color from v4's color-mix() wrapper
          const actualColor = extractColorFromValue(value);
          if (!actualColor) {
            warn(
              `[tailwindcss-color-modifiers] Could not extract color from value: ${value}`,
            );
            return {};
          }

          const adjusted = buildOklchFrom(actualColor, parsed);
          return { [property]: adjusted };
        };
      }

      // Core
      // Note: modifiers: 'any' enables modifier support (e.g., bg-red-500/l+2)
      matchUtilities(
        { bg: buildRule('backgroundColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { text: buildRule('color') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { border: buildRule('borderColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { ring: buildRule('--tw-ring-color') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // Additional common color utilities
      matchUtilities(
        { outline: buildRule('outlineColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { 'ring-offset': buildRule('--tw-ring-offset-color') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // Shadow color utility (Tailwind uses a var pipeline; setting --tw-shadow-color is enough)
      matchUtilities(
        { shadow: buildRule('--tw-shadow-color') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // Text decoration color
      matchUtilities(
        { decoration: buildRule('textDecorationColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // Form/UI related
      matchUtilities(
        { caret: buildRule('caretColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { accent: buildRule('accentColor') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // SVG
      matchUtilities(
        { fill: buildRule('fill') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { stroke: buildRule('stroke') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );

      // Gradient stops
      // Tailwind expects these CSS variables for gradient stops; emitting them preserves composition
      matchUtilities(
        { from: buildRule('--tw-gradient-from') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { via: buildRule('--tw-gradient-via') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
      matchUtilities(
        { to: buildRule('--tw-gradient-to') },
        { values: colors, type: ['color'], modifiers: 'any' },
      );
    },
);

export default colorModifiers;

export const __test__ = { parseModifier, buildOklchFrom, normalizeModifier };
