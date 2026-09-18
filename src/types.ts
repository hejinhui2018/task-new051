/** 领域模型：内容页、补白页、拼版槽位 */

/** 左侧栏中由制作人员编排的内容页（按阅读顺序排列） */
export interface ArtPage {
  kind: 'art';
  id: string;
  /** 页面标题，缩略图与印张上显示 */
  title: string;
  /** 客户标注的印刷页码；不填表示该页未编号（不参与缺页/重号检查） */
  printed?: number;
  /** 四周出血，单位 mm */
  bleed: number;
  /** 内容稿自身是否被旋转 180°（客户来稿倒置） */
  inverted?: boolean;
  /** 缩略图占位色相（0-360），仅用于区分页面 */
  hue: number;
}

/** 系统自动补入的空白页 */
export interface BlankPage {
  kind: 'blank';
  id: string;
}

/** 补白后的书帖页（阅读顺序中的一个位置） */
export type BookPage = ArtPage | BlankPage;

/** 翻面方式：长边 = 书本式左右翻；短边 = 台历式上下翻 */
export type FlipMode = 'long' | 'short';

export type PlateSide = 'front' | 'back';

/** 成品阅读方向下该页的装订边 */
export type BindingEdge = 'left' | 'right' | 'top' | 'bottom';

/** 制版时页面相对正向的旋转角度 */
export type Rotation = 0 | 180;

/** 槽位在印张上的位置：长边翻左右并排，短边翻上下叠放 */
export type SlotPosition = 'left' | 'right' | 'top' | 'bottom';

export const isArtPage = (p: BookPage): p is ArtPage => p.kind === 'art';
