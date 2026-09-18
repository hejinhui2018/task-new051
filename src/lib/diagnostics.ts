import type { BookPage } from '../types';
import { isArtPage } from '../types';

export type IssueLevel = 'error' | 'warning' | 'info';
export type IssueType = 'missing' | 'duplicate' | 'inverted' | 'bleed' | 'blank';

export interface Issue {
  level: IssueLevel;
  type: IssueType;
  /** 关联的阅读顺序页序号（补白后），无具体页时为 -1 */
  pageIndex: number;
  /** 关联的内容页 id（缺页问题没有） */
  pageId?: string;
  message: string;
}

/** 印刷常规最小出血量（mm） */
export const MIN_BLEED_MM = 3;

/**
 * 检查整套书页：
 * - missing  编号在 1..最大编号 之间断号（缺页）
 * - duplicate 同一印刷编号出现多次（重复页）
 * - inverted  内容稿自身被旋转 180°，折叠阅读时会倒置
 * - bleed     出血量小于 3mm
 * - blank     系统补入的空白页（提示，非错误）
 */
export function diagnose(pages: BookPage[], minBleed = MIN_BLEED_MM): Issue[] {
  const issues: Issue[] = [];

  const seen = new Map<number, number>();
  let maxNum = 0;

  pages.forEach((page, index) => {
    if (!isArtPage(page)) {
      issues.push({
        level: 'info',
        type: 'blank',
        pageIndex: index,
        pageId: page.id,
        message: `第 ${index + 1} 帖位为自动补入的空白页`,
      });
      return;
    }

    if (page.inverted) {
      issues.push({
        level: 'error',
        type: 'inverted',
        pageIndex: index,
        pageId: page.id,
        message: `《${page.title}》内容稿倒置 180°，成书翻开时上下颠倒`,
      });
    }

    if (page.bleed < minBleed) {
      issues.push({
        level: 'error',
        type: 'bleed',
        pageIndex: index,
        pageId: page.id,
        message: `《${page.title}》出血 ${page.bleed}mm，不足 ${minBleed}mm`,
      });
    }

    if (typeof page.printed === 'number') {
      maxNum = Math.max(maxNum, page.printed);
      const first = seen.get(page.printed);
      if (first === undefined) {
        seen.set(page.printed, index);
      } else {
        issues.push({
          level: 'error',
          type: 'duplicate',
          pageIndex: index,
          pageId: page.id,
          message: `印刷页码 ${page.printed} 重复（另见阅读序第 ${first + 1} 页）`,
        });
      }
    }
  });

  // 断号检查：已编号页面应覆盖 1..最大编号
  if (maxNum > 0) {
    for (let n = 1; n <= maxNum; n++) {
      if (!seen.has(n)) {
        issues.push({
          level: 'error',
          type: 'missing',
          pageIndex: -1,
          message: `缺页：印刷页码 ${n} 未找到`,
        });
      }
    }
  }

  const order: IssueType[] = ['missing', 'duplicate', 'inverted', 'bleed', 'blank'];
  return issues.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

export function issueCount(issues: Issue[]): Record<IssueLevel, number> {
  return issues.reduce(
    (acc, i) => {
      acc[i.level]++;
      return acc;
    },
    { error: 0, warning: 0, info: 0 },
  );
}
