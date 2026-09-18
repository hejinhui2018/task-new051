import type {
  ArtPage,
  BindingEdge,
  BlankPage,
  BookPage,
  FlipMode,
  PlateSide,
  Rotation,
  SlotPosition,
} from '../types';

/** 印张上的一个槽位（半张纸） */
export interface PlateSlot {
  side: PlateSide;
  slot: SlotPosition;
  /** 该槽位在成书阅读顺序中的序号（0 基） */
  pageIndex: number;
  page: BookPage;
  /** 制版时相对正向的旋转角 */
  rotation: Rotation;
  /** 成品阅读方向下的装订边 */
  binding: BindingEdge;
}

/** 一张对开印张：正反面各两个页码 */
export interface Sheet {
  /** 0 = 最外帖，数字越大越靠近书心 */
  index: number;
  front: [PlateSlot, PlateSlot];
  back: [PlateSlot, PlateSlot];
}

export interface Imposition {
  /** 补白后按阅读顺序排列的全部书页 */
  pages: BookPage[];
  /** 补白后总页数（4 的倍数） */
  paddedCount: number;
  /** 自动补入的空白页数 */
  addedBlanks: number;
  sheets: Sheet[];
}

let blankSeq = 0;
const makeBlank = (): BlankPage => ({ kind: 'blank', id: `blank-${++blankSeq}` });

/** 向上取整到 4 的倍数（骑马钉每张纸折后为 4 页） */
export function paddedPageCount(n: number): number {
  if (n <= 0) return 0;
  return Math.ceil(n / 4) * 4;
}

/**
 * 补白：页数不足 4 的倍数时，在封底（最后一个内容页）之前
 * 插入空白页，使总数为 4 的倍数。
 */
export function padPages(arts: ArtPage[]): { pages: BookPage[]; added: number } {
  if (arts.length === 0) return { pages: [], added: 0 };
  const target = paddedPageCount(arts.length);
  const added = target - arts.length;
  if (added === 0) return { pages: [...arts], added: 0 };

  // 重置序号，保证同一输入得到稳定的空白页 id
  blankSeq = 0;
  const blanks = Array.from({ length: added }, makeBlank);
  const backCover = arts[arts.length - 1];
  return {
    pages: [...arts.slice(0, -1), ...blanks, backCover],
    added,
  };
}

interface SlotSpec {
  side: PlateSide;
  slot: SlotPosition;
  pageIndex: number;
  rotation: Rotation;
  binding: BindingEdge;
}

/**
 * 单个书帖在 n 页书中的槽位规格（页码配对规律两种翻面相同，
 * 差别在槽位方向与旋转，见各分支注释）。
 *
 * 以 16 页书最外帖（i=0）为例，配对恒为：
 *   外开面：n-1（封底）+ 0（封面）
 *   内开面：1（封二） + n-2（封三）
 *
 * 【长边翻 · 竖折 · 左右翻书】纸张左右对折，槽位左右并排，
 * 折口中缝在两槽之间。绕竖直轴翻面不改变上下方向，四版制版
 * 全部正向（rotation 0）。各槽装订边指向中缝：左槽在右、右槽在左。
 *
 * 【短边翻 · 横折 · 台历式顶订】纸张上下对折，槽位上下叠放。
 *   正面（自然视图）：上 = n-1-2i，下 = 2i；背面（绕水平轴翻面后
 *   的自然视图）：上 = 2i+1，下 = n-2-2i。以折口为书页头部逐页做
 *   折叠坐标追踪：两个上槽（封底位 n-1-2i 与封二位 2i+1）制版须
 *   旋转 180°，两个下槽正向。装订边（制版视图中指向中缝）：上槽在
 *   下沿、下槽在上沿——成品翻阅时四边汇合为顶订折口。
 */
function slotSpecs(sheetIndex: number, n: number, flip: FlipMode): SlotSpec[] {
  if (flip === 'long') {
    return [
      { side: 'front', slot: 'left', pageIndex: n - 1 - 2 * sheetIndex, rotation: 0, binding: 'right' },
      { side: 'front', slot: 'right', pageIndex: 2 * sheetIndex, rotation: 0, binding: 'left' },
      { side: 'back', slot: 'left', pageIndex: 2 * sheetIndex + 1, rotation: 0, binding: 'right' },
      { side: 'back', slot: 'right', pageIndex: n - 2 - 2 * sheetIndex, rotation: 0, binding: 'left' },
    ];
  }
  return [
    { side: 'front', slot: 'top', pageIndex: n - 1 - 2 * sheetIndex, rotation: 180, binding: 'bottom' },
    { side: 'front', slot: 'bottom', pageIndex: 2 * sheetIndex, rotation: 0, binding: 'top' },
    { side: 'back', slot: 'top', pageIndex: 2 * sheetIndex + 1, rotation: 180, binding: 'bottom' },
    { side: 'back', slot: 'bottom', pageIndex: n - 2 - 2 * sheetIndex, rotation: 0, binding: 'top' },
  ];
}

/** 由内容页生成整套骑马钉拼版方案 */
export function buildImposition(arts: ArtPage[], flip: FlipMode): Imposition {
  const { pages, added } = padPages(arts);
  const n = pages.length;
  const sheetCount = n / 4;
  const sheets: Sheet[] = [];

  for (let i = 0; i < sheetCount; i++) {
    const specs = slotSpecs(i, n, flip);
    const toSlot = (s: SlotSpec): PlateSlot => ({ ...s, page: pages[s.pageIndex] });
    const fl = specs.filter((s) => s.side === 'front');
    const bk = specs.filter((s) => s.side === 'back');
    const first = (list: SlotSpec[]) => toSlot(list[0]);
    const second = (list: SlotSpec[]) => toSlot(list[1]);
    sheets.push({
      index: i,
      front: [first(fl), second(fl)],
      back: [first(bk), second(bk)],
    });
  }

  return { pages, paddedCount: n, addedBlanks: added, sheets };
}
