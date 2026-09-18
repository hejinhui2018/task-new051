import { describe, expect, it } from 'vitest';
import { buildImposition, padPages, paddedPageCount } from './imposition';
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

describe('paddedPageCount', () => {
  it('页数为 0 时返回 0', () => {
    expect(paddedPageCount(0)).toBe(0);
  });
  it('已是 4 的倍数时不变', () => {
    expect(paddedPageCount(4)).toBe(4);
    expect(paddedPageCount(16)).toBe(16);
  });
  it('不足时向上取整到 4 的倍数', () => {
    expect(paddedPageCount(1)).toBe(4);
    expect(paddedPageCount(5)).toBe(8);
    expect(paddedPageCount(17)).toBe(20);
  });
});

describe('padPages', () => {
  it('空白输入不补页', () => {
    expect(padPages([])).toEqual({ pages: [], added: 0 });
  });
  it('16 页不补白', () => {
    const { pages, added } = padPages(makePages(16));
    expect(added).toBe(0);
    expect(pages).toHaveLength(16);
  });
  it('18 页补 2 张空白，且空白页在封底之前', () => {
    const arts = makePages(18);
    const { pages, added } = padPages(arts);
    expect(added).toBe(2);
    expect(pages).toHaveLength(20);
    // 封底始终是最后一个内容页
    expect(pages[pages.length - 1]).toBe(arts[17]);
    // 第 18、19 帖位（索引 17、18）为空白，原第 18 内容页（封底）挪到索引 19
    expect(pages[17].kind).toBe('blank');
    expect(pages[18].kind).toBe('blank');
    // 空白页之前仍是原第 17 内容页
    expect(pages[16]).toBe(arts[16]);
  });
  it('17 页补 1 张空白并保持封底最后', () => {
    const arts = makePages(17);
    const { pages } = padPages(arts);
    expect(pages).toHaveLength(20);
    expect(pages[17].kind).toBe('blank');
    expect(pages[19]).toBe(arts[16]);
  });
});

describe('buildImposition - 16 页标准骑马钉配对', () => {
  const imp = buildImposition(makePages(16), 'long');

  it('共 4 张印张', () => {
    expect(imp.sheets).toHaveLength(4);
  });

  it('最外帖正面为 16-1，背面为 2-15（按印刷页码）', () => {
    const outer = imp.sheets[0];
    const num = (s: (typeof outer.front)[number]) =>
      s.page.kind === 'art' ? s.page.printed : undefined;
    expect(outer.front.map(num)).toEqual([16, 1]);
    expect(outer.back.map(num)).toEqual([2, 15]);
  });

  it('各帖页码配对依次向内收敛', () => {
    const nums = (side: (typeof imp.sheets)[number]['front']) =>
      side.map((s) => (s.page.kind === 'art' ? s.page.printed : -1));
    expect(nums(imp.sheets[0].front)).toEqual([16, 1]);
    expect(nums(imp.sheets[0].back)).toEqual([2, 15]);
    expect(nums(imp.sheets[1].front)).toEqual([14, 3]);
    expect(nums(imp.sheets[1].back)).toEqual([4, 13]);
    expect(nums(imp.sheets[2].front)).toEqual([12, 5]);
    expect(nums(imp.sheets[2].back)).toEqual([6, 11]);
    expect(nums(imp.sheets[3].front)).toEqual([10, 7]);
    expect(nums(imp.sheets[3].back)).toEqual([8, 9]);
  });

  it('每个阅读页号恰好出现一次', () => {
    const all = imp.sheets.flatMap((s) => [...s.front, ...s.back]).map((s) => s.pageIndex);
    expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe('buildImposition - 长边翻页（书本式）', () => {
  const imp = buildImposition(makePages(8), 'long');

  it('正反面四版全部正向（绕竖轴翻面不会倒置）', () => {
    const s0 = imp.sheets[0];
    expect(s0.front.map((s) => s.rotation)).toEqual([0, 0]);
    expect(s0.back.map((s) => s.rotation)).toEqual([0, 0]);
  });

  it('槽位左右并排，装订边指向中缝（左槽在右沿、右槽在左沿）', () => {
    const s0 = imp.sheets[0];
    expect(s0.front.map((s) => s.slot)).toEqual(['left', 'right']);
    expect(s0.front.map((s) => s.binding)).toEqual(['right', 'left']);
    expect(s0.back.map((s) => s.binding)).toEqual(['right', 'left']);
  });
});

describe('buildImposition - 短边翻页（台历式）', () => {
  const imp = buildImposition(makePages(8), 'short');

  it('槽位上下叠放：正面为 8-1、背面为 2-7', () => {
    const s0 = imp.sheets[0];
    const num = (s: (typeof s0.front)[number]) =>
      s.page.kind === 'art' ? s.page.printed : undefined;
    expect(s0.front.map((s) => s.slot)).toEqual(['top', 'bottom']);
    expect(s0.back.map((s) => s.slot)).toEqual(['top', 'bottom']);
    expect(s0.front.map(num)).toEqual([8, 1]);
    expect(s0.back.map(num)).toEqual([2, 7]);
  });

  it('上下槽两个上槽（封底位、封二位）制版旋转 180°，两个下槽正向', () => {
    const s0 = imp.sheets[0];
    expect(s0.front.map((s) => s.rotation)).toEqual([180, 0]);
    expect(s0.back.map((s) => s.rotation)).toEqual([180, 0]);
  });

  it('装订边指向中缝：上槽在下沿、下槽在上沿（成品汇合为顶订折口）', () => {
    const s0 = imp.sheets[0];
    expect(s0.front.map((s) => s.binding)).toEqual(['bottom', 'top']);
    expect(s0.back.map((s) => s.binding)).toEqual(['bottom', 'top']);
  });
});

describe('长边与短边翻面差异不止于标签', () => {
  const long = buildImposition(makePages(16), 'long');
  const short = buildImposition(makePages(16), 'short');

  it('长边全部正向；短边每帖两个上槽倒置', () => {
    const rotated = (imp: typeof long) =>
      imp.sheets
        .flatMap((s) => [...s.front, ...s.back])
        .filter((s) => s.rotation === 180)
        .map((s) => `${s.side}:${s.slot}`);
    expect(rotated(long)).toEqual([]);
    // 16 页 = 4 帖，每帖正面上槽与背面上槽各旋转
    expect(rotated(short).sort()).toEqual([
      ...Array(4).fill('back:top'),
      ...Array(4).fill('front:top'),
    ]);
  });

  it('槽位排布不同：长边左右并排，短边上下叠放', () => {
    const positions = (imp: typeof long) =>
      imp.sheets.flatMap((s) => [...s.front, ...s.back].map((x) => x.slot));
    // 4 帖 × 每面 2 槽 × 2 面 = 16 个槽位
    expect(positions(long).sort()).toEqual(
      [...Array(8).fill('left'), ...Array(8).fill('right')],
    );
    expect(positions(short).sort()).toEqual(
      [...Array(8).fill('bottom'), ...Array(8).fill('top')],
    );
  });

  it('同一页号在两种翻面下的物理位置与旋转均不同', () => {
    const locate = (imp: typeof long, pageIndex: number) => {
      const slot = imp.sheets
        .flatMap((s) => [...s.front, ...s.back])
        .find((s) => s.pageIndex === pageIndex)!;
      return `${slot.side}:${slot.slot}:r${slot.rotation}`;
    };
    // 第 2 页（index 1）：长边在背面左槽正向；短边在背面上槽倒置
    expect(locate(long, 1)).toBe('back:left:r0');
    expect(locate(short, 1)).toBe('back:top:r180');
    // 封底位（index n-1）：短边在正面上槽倒置，长边在正面左槽正向
    expect(locate(long, 15)).toBe('front:left:r0');
    expect(locate(short, 15)).toBe('front:top:r180');
  });
});
