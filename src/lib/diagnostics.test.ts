import { describe, expect, it } from 'vitest';
import { diagnose, issueCount, MIN_BLEED_MM } from './diagnostics';
import type { ArtPage, BookPage } from '../types';

const art = (over: Partial<ArtPage> & Pick<ArtPage, 'id' | 'title'>): ArtPage => ({
  kind: 'art',
  printed: undefined,
  bleed: 3,
  hue: 0,
  ...over,
});

describe('diagnose', () => {
  it('连续编号且出血充足时无错误', () => {
    const pages: BookPage[] = [1, 2, 3, 4].map((n) =>
      art({ id: `p${n}`, title: `页${n}`, printed: n }),
    );
    const issues = diagnose(pages);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('发现断号缺页', () => {
    const pages: BookPage[] = [1, 2, 4].map((n) => art({ id: `p${n}`, title: `页${n}`, printed: n }));
    const issues = diagnose(pages);
    const missing = issues.filter((i) => i.type === 'missing');
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain('3');
  });

  it('发现重复印刷页码', () => {
    const pages: BookPage[] = [
      art({ id: 'a', title: 'A', printed: 1 }),
      art({ id: 'b', title: 'B', printed: 2 }),
      art({ id: 'c', title: 'C', printed: 2 }),
    ];
    const dup = diagnose(pages).filter((i) => i.type === 'duplicate');
    expect(dup).toHaveLength(1);
    expect(dup[0].pageId).toBe('c');
  });

  it('发现倒置来稿', () => {
    const pages: BookPage[] = [
      art({ id: 'a', title: 'A', printed: 1, inverted: true }),
      art({ id: 'b', title: 'B', printed: 2 }),
    ];
    const inv = diagnose(pages).filter((i) => i.type === 'inverted');
    expect(inv).toHaveLength(1);
    expect(inv[0].pageIndex).toBe(0);
  });

  it(`出血小于 ${MIN_BLEED_MM}mm 时报警`, () => {
    const pages: BookPage[] = [
      art({ id: 'a', title: 'A', printed: 1, bleed: 2 }),
      art({ id: 'b', title: 'B', printed: 2, bleed: 3 }),
    ];
    const bleed = diagnose(pages).filter((i) => i.type === 'bleed');
    expect(bleed).toHaveLength(1);
    expect(bleed[0].pageId).toBe('a');
  });

  it('补入的空白页给出 info 提示而非错误', () => {
    // 实际补白场景：封底通常不编页码，因此不会与空白帖位形成断号
    const pages: BookPage[] = [
      art({ id: 'a', title: '封面', printed: 1 }),
      { kind: 'blank', id: 'b1' },
      { kind: 'blank', id: 'b2' },
      art({ id: 'd', title: '封底' }),
    ];
    const issues = diagnose(pages);
    expect(issues.filter((i) => i.type === 'blank')).toHaveLength(2);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('未编号页面不参与断号检查', () => {
    const pages: BookPage[] = [art({ id: 'a', title: 'A' }), art({ id: 'b', title: 'B' })];
    expect(diagnose(pages).filter((i) => i.type === 'missing')).toHaveLength(0);
  });

  it('issueCount 汇总各级数量', () => {
    const pages: BookPage[] = [
      art({ id: 'a', title: 'A', printed: 1, bleed: 1 }),
      { kind: 'blank', id: 'x' },
    ];
    const counts = issueCount(diagnose(pages));
    expect(counts.error).toBe(1);
    expect(counts.info).toBe(1);
  });
});
