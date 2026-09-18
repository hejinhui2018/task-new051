import type { Imposition } from './imposition';
import type { BindingEdge, FlipMode, PlateSide, Rotation, SlotPosition } from '../types';

/** 成书后按阅读顺序看到的一页 */
export interface FoldedPosition {
  /** 阅读顺序序号（0 基，即翻开后第 index+1 页） */
  readingIndex: number;
  /** 所在印张（0 = 最外帖） */
  sheetIndex: number;
  /** 该页印在纸张的哪一面、哪个槽位 */
  side: PlateSide;
  slot: SlotPosition;
  /** 制版旋转角；折叠后会被折手方向自动抵消，正常页面阅读时仍为正向 */
  plateRotation: Rotation;
  binding: BindingEdge;
}

/**
 * 折叠后阅读顺序：把所有印张槽位按阅读序号展开。
 * 骑马钉整帖嵌套折叠后，阅读顺序即补白页数组的下标顺序
 * 0,1,2,…,n-1；这里同时给出每个阅读页在印张上的物理位置，
 * 供预演高亮与检查使用。
 */
export function foldedOrder(imp: Imposition): FoldedPosition[] {
  const result: FoldedPosition[] = new Array(imp.paddedCount);

  for (const sheet of imp.sheets) {
    for (const side of [sheet.front, sheet.back] as const) {
      for (const slot of side) {
        result[slot.pageIndex] = {
          readingIndex: slot.pageIndex,
          sheetIndex: sheet.index,
          side: slot.side,
          slot: slot.slot,
          plateRotation: slot.rotation,
          binding: slot.binding,
        };
      }
    }
  }

  return result;
}

/** 一帖纸在装订处对折：判断某阅读页翻开后位于书帖的上页还是下页（仅用于预演动画标注） */
export function leafHalf(readingIndex: number): 'outer' | 'inner' {
  // 偶数阅读页（0,2,4…）在每张纸对折后的外侧半帖
  return readingIndex % 2 === 0 ? 'outer' : 'inner';
}

/** 翻面方式的中文说明 */
export const FLIP_LABEL: Record<FlipMode, string> = {
  long: '长边翻页（左右翻 · 书本式）',
  short: '短边翻页（上下翻 · 台历式）',
};
