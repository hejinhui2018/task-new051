import type { ArtPage } from '../types';
import { uid } from './uid';

/**
 * 内置 16 页产品手册（骑马钉标准书帖：4 张纸）。
 * 首尾两页出血 2mm，是有意保留的「出血不足」示例，
 * 方便首屏即看到诊断结果；可随时在左侧修正。
 */
export function createSamplePages(): ArtPage[] {
  const titles = [
    '封面 · 星云咖啡机 X1',
    '目录',
    '品牌故事',
    '核心技术一览',
    '研磨系统',
    '恒温萃取',
    '奶泡打发',
    '触控面板',
    '清洁与保养',
    '规格参数',
    '咖啡食谱',
    '配件清单',
    '保修条款',
    '常见问题',
    '经销商网络',
    '封底 · 联系方式',
  ];

  return titles.map((title, i) => ({
    kind: 'art',
    id: uid('sample'),
    title,
    printed: i + 1,
    // 封面与封底是跨整页的图片页，来稿只留了 2mm 出血
    bleed: i === 0 || i === titles.length - 1 ? 2 : 3,
    hue: Math.round((i * 360) / titles.length),
  }));
}
