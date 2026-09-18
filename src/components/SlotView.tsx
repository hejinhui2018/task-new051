import type { PlateSlot } from '../lib/imposition';
import type { FlipMode } from '../types';
import { isArtPage } from '../types';
import { LeafArt, LeafBlank } from './LeafArt';
import { MIN_BLEED_MM } from '../lib/diagnostics';

interface SlotViewProps {
  slot: PlateSlot;
  flip: FlipMode;
  active: boolean;
  onSelect: () => void;
}

const BINDING_LABEL: Record<PlateSlot['binding'], string> = {
  left: '装订边·左',
  right: '装订边·右',
  top: '装订边·上',
  bottom: '装订边·下',
};

/** 单个印版槽位：出血区、裁切线、页码、制版朝向、装订边 */
export function SlotView({ slot, flip, active, onSelect }: SlotViewProps) {
  const art = isArtPage(slot.page) ? slot.page : null;
  const bleedBad = art ? art.bleed < MIN_BLEED_MM : false;
  // 出血框视觉宽度：每 mm 约 1.2px，封顶 8px
  const bleedPx = Math.min(8, Math.max(2, art ? art.bleed * 1.2 : 3));

  return (
    <button
      type="button"
      className={`slot slot--${flip} slot--bind-${slot.binding} ${active ? 'is-active' : ''}`}
      onClick={onSelect}
      title={`阅读序第 ${slot.pageIndex + 1} 页 · 制版旋转 ${slot.rotation}° · ${BINDING_LABEL[slot.binding]}`}
    >
      {/* 出血区 */}
      <div
        className={`slot__bleed ${bleedBad ? 'slot__bleed--bad' : ''}`}
        style={{ borderWidth: `${bleedPx}px` }}
      >
        {/* 裁切框（成品尺寸线） */}
        <div className="slot__trim">
          <span className="crop crop--tl" />
          <span className="crop crop--tr" />
          <span className="crop crop--bl" />
          <span className="crop crop--br" />

          <div
            className="slot__content"
            style={{ transform: `rotate(${slot.rotation}deg)` }}
          >
            {art ? (
              <LeafArt page={art} rotateWithInversion />
            ) : (
              <LeafBlank page={slot.page as Extract<typeof slot.page, { kind: 'blank' }>} />
            )}
            <span className="slot__head-mark" title="制版时页面头部方向">
              ↑ 头
            </span>
          </div>
        </div>
      </div>

      <div className="slot__meta">
        <span className="slot__pageno">阅读序 {slot.pageIndex + 1}</span>
        <span className="slot__rot">制版 {slot.rotation}°</span>
      </div>
      {art && (
        <div className="slot__tags">
          <span className={`tag tag--bleed ${bleedBad ? 'tag--bad' : ''}`}>
            出血 {art.bleed}mm
          </span>
          {art.inverted && <span className="tag tag--bad">来稿倒置</span>}
        </div>
      )}
      <span className="slot__bind-bar" aria-label={BINDING_LABEL[slot.binding]} />
    </button>
  );
}
