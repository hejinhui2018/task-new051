import type { ArtPage, BlankPage } from '../types';

interface LeafArtProps {
  page: ArtPage;
  /** 模拟实际阅读效果时，来稿倒置要体现为上下颠倒 */
  rotateWithInversion?: boolean;
  compact?: boolean;
}

/** 页面美术稿的视觉占位：渐变色 + 标题 + 页码 */
export function LeafArt({ page, rotateWithInversion, compact }: LeafArtProps) {
  const transform = rotateWithInversion && page.inverted ? 'rotate(180deg)' : undefined;
  return (
    <div
      className={`leaf-art ${compact ? 'leaf-art--compact' : ''}`}
      style={{
        background: `linear-gradient(135deg, hsl(${page.hue} 70% 88%), hsl(${(page.hue + 40) % 360} 65% 76%))`,
      }}
    >
      <div className="leaf-art__inner" style={{ transform }}>
        <span className="leaf-art__title">{page.title}</span>
        {typeof page.printed === 'number' && (
          <span className="leaf-art__num">{page.printed}</span>
        )}
      </div>
    </div>
  );
}

/** 自动补入的空白页 */
export function LeafBlank({ page, compact }: { page: BlankPage; compact?: boolean }) {
  return (
    <div className={`leaf-blank ${compact ? 'leaf-blank--compact' : ''}`} data-id={page.id}>
      <span>空白页</span>
    </div>
  );
}
