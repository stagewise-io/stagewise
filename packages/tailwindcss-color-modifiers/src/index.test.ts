import { describe, it, expect, vi } from 'vitest';
import { __test__ } from './index';

describe('parseModifier', () => {
  it('scales integers for l/c/a (add/subtract)', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('l+2', warn);
    expect(parsed?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '+',
      value: 0.02,
    });
  });

  it('treats decimals as literal (add/subtract)', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('l+0.02', warn);
    expect(parsed?.ops[0].value).toBe(0.02);
  });

  it('supports % for l/c/a (add/subtract only)', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('a-50%', warn);
    expect(parsed?.ops[0]).toMatchObject({
      channel: 'a',
      operation: '-',
      value: 0.5,
    });
  });

  it('parses hue in degrees and rejects %', () => {
    const warn = vi.fn();
    expect(__test__.parseModifier('h+10', warn)?.ops[0].value).toBe(10);
    expect(__test__.parseModifier('h+10%', warn)).toBeNull();
  });

  it('accepts no separator, underscore, comma, and space', () => {
    const warn = vi.fn();
    expect(__test__.parseModifier('l+0.02c-0.04h+10', warn)?.ops).toHaveLength(
      3,
    );
    expect(
      __test__.parseModifier('l+0.02_c-0.04_h+10', warn)?.ops,
    ).toHaveLength(3);
    expect(
      __test__.parseModifier('l+0.02,c-0.04,h+10', warn)?.ops,
    ).toHaveLength(3);
    // Space separators (v4 may convert underscores to spaces)
    expect(
      __test__.parseModifier('l+0.02 c-0.04 h+10', warn)?.ops,
    ).toHaveLength(3);
  });

  it('strips surrounding brackets (v4 arbitrary modifier syntax)', () => {
    const warn = vi.fn();
    expect(__test__.parseModifier('[l+2]', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '+',
      value: 0.02,
    });
    expect(
      __test__.parseModifier('[l+0.02_c-0.04_h+10]', warn)?.ops,
    ).toHaveLength(3);
  });

  it('does not match opacity modifiers', () => {
    const warn = vi.fn();
    expect(__test__.parseModifier('50', warn)).toBeNull();
  });

  it('defaults to + when operation is omitted (l20 = l+20)', () => {
    const warn = vi.fn();
    // Without operation = add (increase)
    expect(__test__.parseModifier('l20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '+',
      value: 0.2,
    });
    // With explicit minus = subtract (decrease)
    expect(__test__.parseModifier('l-20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '-',
      value: 0.2,
    });
    // Mixed: some with operation, some without
    expect(__test__.parseModifier('l20c-0.05h30', warn)?.ops).toEqual([
      expect.objectContaining({ channel: 'l', operation: '+', value: 0.2 }),
      expect.objectContaining({ channel: 'c', operation: '-', value: 0.05 }),
      expect.objectContaining({ channel: 'h', operation: '+', value: 30 }),
    ]);
  });

  it('supports p (plus) and m (minus) as operation alternatives', () => {
    const warn = vi.fn();
    // p = plus (add)
    expect(__test__.parseModifier('lp20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '+',
      value: 0.2,
    });
    // m = minus (subtract)
    expect(__test__.parseModifier('lm20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '-',
      value: 0.2,
    });
    // Mixed with p/m
    expect(__test__.parseModifier('lp20_cm0.05_hp30', warn)?.ops).toEqual([
      expect.objectContaining({ channel: 'l', operation: '+', value: 0.2 }),
      expect.objectContaining({ channel: 'c', operation: '-', value: 0.05 }),
      expect.objectContaining({ channel: 'h', operation: '+', value: 30 }),
    ]);
    // Case insensitive
    expect(__test__.parseModifier('LP20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '+',
      value: 0.2,
    });
    expect(__test__.parseModifier('LM20', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '-',
      value: 0.2,
    });
  });

  it('supports x (multiply) and d (divide) operations', () => {
    const warn = vi.fn();
    // x = multiply (no auto-scaling)
    expect(__test__.parseModifier('lx1.2', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '*',
      value: 1.2,
    });
    // d = divide (no auto-scaling)
    expect(__test__.parseModifier('ld2', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '/',
      value: 2,
    });
    // Explicit * and / symbols (bracket syntax)
    expect(__test__.parseModifier('[l*1.5]', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '*',
      value: 1.5,
    });
    expect(__test__.parseModifier('[c/3]', warn)?.ops[0]).toMatchObject({
      channel: 'c',
      operation: '/',
      value: 3,
    });
    // Case insensitive
    expect(__test__.parseModifier('LX2', warn)?.ops[0]).toMatchObject({
      channel: 'l',
      operation: '*',
      value: 2,
    });
    expect(__test__.parseModifier('CD4', warn)?.ops[0]).toMatchObject({
      channel: 'c',
      operation: '/',
      value: 4,
    });
  });

  it('does NOT auto-scale values for multiply/divide', () => {
    const warn = vi.fn();
    // lx2 should be "L * 2", NOT "L * 0.02"
    expect(__test__.parseModifier('lx2', warn)?.ops[0].value).toBe(2);
    expect(__test__.parseModifier('ld10', warn)?.ops[0].value).toBe(10);
    // Decimals work as expected
    expect(__test__.parseModifier('cx0.5', warn)?.ops[0].value).toBe(0.5);
  });

  it('rejects % with multiply/divide', () => {
    const warn = vi.fn();
    expect(__test__.parseModifier('lx50%', warn)).toBeNull();
    expect(__test__.parseModifier('ld50%', warn)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('supports mixed operations in one modifier', () => {
    const warn = vi.fn();
    // Add lightness, multiply chroma
    const parsed = __test__.parseModifier('l20_cx0.5', warn);
    expect(parsed?.ops).toEqual([
      expect.objectContaining({ channel: 'l', operation: '+', value: 0.2 }),
      expect.objectContaining({ channel: 'c', operation: '*', value: 0.5 }),
    ]);
  });
});

describe('buildOklchFrom', () => {
  it('generates oklch(from ...) with add/subtract', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('l+2c-0.01h+10a-0.2', warn)!;
    const css = __test__.buildOklchFrom('var(--color-green-300)', parsed);

    expect(css).toContain('oklch(from var(--color-green-300)');
    expect(css).toContain('calc(L + 0.02)');
    expect(css).toContain('calc(C - 0.01)');
    expect(css).toContain('calc(h + 10)'); // h is unitless degrees in oklch relative syntax
    expect(css).toContain('/ calc(alpha - 0.2)');
  });

  it('generates oklch(from ...) with multiply/divide', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('lx1.2cd2', warn)!;
    const css = __test__.buildOklchFrom('var(--color-blue-500)', parsed);

    expect(css).toContain('oklch(from var(--color-blue-500)');
    expect(css).toContain('calc(L * 1.2)');
    expect(css).toContain('calc(C / 2)');
  });

  it('handles mixed operations', () => {
    const warn = vi.fn();
    const parsed = __test__.parseModifier('l20cx0.5', warn)!;
    const css = __test__.buildOklchFrom('#ff0000', parsed);

    expect(css).toContain('calc(L + 0.2)');
    expect(css).toContain('calc(C * 0.5)');
  });
});
