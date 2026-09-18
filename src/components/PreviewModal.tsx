import { useEffect } from 'react';
import type { Imposition } from '../lib/imposition';
import { foldedOrder } from '../lib/fold';
import type { Issue } from '../lib/diagnostics';
import { isArtPage } from '../types';
import { LeafArt, LeafBlank } from './LeafArt';

interface PreviewModalProps {
  imp: Imposition;
  index: number;
  issues: Issue[];
  onNavigate: (index: number) => void;
  onClose: () => void;
}

const ISSUE_LABEL: Record<Issue['type'], string> = {
  missing: '缺页',
  duplicate: '重复页',
  inverted: '倒置',
  bleed: '出血不足',
  blank: '自动补白',
};

/** 逐页翻阅成书后的真实效果 */
export function PreviewModal({ imp, index, issues, onNavigate, onClose }: PreviewModalProps) {
  const total = imp.paddedCount;
  const page = imp.pages[index];
  const loc = foldedOrder(imp)[index];
  const here = issues.filter((i) => i.pageIndex === index);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onNavigate(Math.max(0, index - 1));
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        onNavigate(Math.min(total - 1, index + 1));
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, onNavigate, onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal__head">
          <h2>折叠预演 · 成书翻阅</h2>
          <button type="button" className="mini-btn" onClick={onClose}>
            关闭 ✕
          </button>
        </header>

        <div className="preview-stage">
          <button
            type="button"
            className="btn btn--nav"
            disabled={index === 0}
            onClick={() => onNavigate(index - 1)}
          >
            ‹ 上一页
          </button>

          <div className="preview-book">
            <div className="preview-book__counter">
              第 {index + 1} / {total} 帖位
            </div>
            <div className="preview-book__leaf">
              {isArtPage(page) ? (
                // 折叠后制版旋转已被折手抵消，只保留来稿自身的倒置问题
                <LeafArt page={page} rotateWithInversion />
              ) : (
                <LeafBlank page={page} />
              )}
            </div>
            <div className="preview-book__meta">
              <span>
                位于第 {loc.sheetIndex + 1} 帖 · {loc.side === 'front' ? '正面' : '背面'} ·{' '}
                {loc.slot} 槽
              </span>
              {isArtPage(page) && typeof page.printed === 'number' && (
                <span>印刷页码 {page.printed}</span>
              )}
            </div>
            {here.length > 0 && (
              <ul className="preview-book__issues">
                {here.map((iss, k) => (
                  <li key={k} className={`issue-chip issue-chip--${iss.level}`}>
                    {ISSUE_LABEL[iss.type]}：{iss.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="btn btn--nav"
            disabled={index === total - 1}
            onClick={() => onNavigate(index + 1)}
          >
            下一页 ›
          </button>
        </div>

        <input
          className="preview-seek"
          type="range"
          min={0}
          max={total - 1}
          value={index}
          onChange={(e) => onNavigate(Number(e.target.value))}
          aria-label="翻阅位置"
        />
        <p className="hint">方向键 / 空格翻页，Esc 关闭；当前位置自动保存在浏览器本地。</p>
      </div>
    </div>
  );
}
