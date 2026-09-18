import { describe, expect, it } from 'vitest';
import { buildImposition } from './imposition';
import { foldedOrder, leafHalf } from './fold';
import type { ArtPage } from '../types';

const makePages = (n: number): ArtPage[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'art' as const,
    id: `p${i}`,
    title: `第${i + 1}页`,
    printed: i + 1,
    bleed: 3,
    hue: i * 10,
  }));

describe('foldedOrder - 折叠后阅读顺序', () => {
  it('16 页书折叠后按 0..15 顺序读到所有页', () => {
    const imp = buildImposition(makePages(16), 'long');
    const order = foldedOrder(imp);
    expect(order).toHaveLength(16);
    expect(order.map((p) => p.readingIndex)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('阅读序第 0 页（封面）位于最外帖正面右槽', () => {
    const imp = buildImposition(makePages(16), 'long');
    const cover = foldedOrder(imp)[0];
    expect(cover).toMatchObject({ sheetIndex: 0, side: 'front', slot: 'right' });
  });

  it('阅读序第 15 页（封底）位于最外帖正面左槽', () => {
    const imp = buildImposition(makePages(16), 'long');
    const back = foldedOrder(imp)[15];
    expect(back).toMatchObject({ sheetIndex: 0, side: 'front', slot: 'left' });
  });

  it('最内帖包含中间的 8、9 页', () => {
    const imp = buildImposition(makePages(16), 'long');
    const order = foldedOrder(imp);
    expect(order[7].sheetIndex).toBe(3);
    expect(order[8].sheetIndex).toBe(3);
  });

  it('每个阅读页都能映射到唯一的印张槽位', () => {
    const imp = buildImposition(makePages(20), 'long');
    const keys = foldedOrder(imp).map((p) => `${p.sheetIndex}:${p.side}:${p.slot}`);
    expect(new Set(keys).size).toBe(20);
  });
});

describe('短边翻面下折叠顺序仍连续', () => {
  it('短边翻面 12 页阅读序完整', () => {
    const imp = buildImposition(makePages(12), 'short');
    const order = foldedOrder(imp);
    expect(order.map((p) => p.readingIndex)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});

describe('leafHalf', () => {
  it('偶数阅读页在外半帖，奇数在内半帖', () => {
    expect(leafHalf(0)).toBe('outer');
    expect(leafHalf(1)).toBe('inner');
    expect(leafHalf(2)).toBe('outer');
  });
});
