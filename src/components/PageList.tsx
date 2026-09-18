import { useState } from 'react';
import type { ArtPage } from '../types';
import { LeafArt } from './LeafArt';
import { uid } from '../lib/uid';

interface PageListProps {
  pages: ArtPage[];
  onReorder: (pages: ArtPage[]) => void;
  onAdd: (page: ArtPage) => void;
  onDelete: (id: string) => void;
  onChange: (id: string, patch: Partial<ArtPage>) => void;
}

export function PageList({ pages, onReorder, onAdd, onDelete, onChange }: PageListProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = pages.findIndex((p) => p.id === dragId);
    const to = pages.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const addPage = () => {
    onAdd({
      kind: 'art',
      id: uid('art'),
      title: `新增页面 ${pages.length + 1}`,
      bleed: 3,
      hue: Math.floor(Math.random() * 360),
    });
  };

  return (
    <aside className="page-list">
      <div className="panel-head">
        <h2>页面顺序</h2>
        <span className="muted">{pages.length} 页内容稿</span>
      </div>

      <ol className="page-list__items">
        {pages.map((page, i) => (
          <li
            key={page.id}
            className={`page-item ${dragId === page.id ? 'is-dragging' : ''} ${
              overId === page.id && dragId !== page.id ? 'is-over' : ''
            }`}
            draggable
            onDragStart={() => setDragId(page.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== page.id) setOverId(page.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              move(page.id);
              setDragId(null);
              setOverId(null);
            }}
          >
            <span className="page-item__grip" title="拖动调整顺序">
              ⠿
            </span>
            <span className="page-item__seq">{i + 1}</span>
            <LeafArt page={page} compact />
            <div className="page-item__controls">
              <label className="mini-control" title="印刷页码（留空表示不编号）">
                页码
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={page.printed ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    onChange(
                      page.id,
                      e.target.value === ''
                        ? { printed: undefined }
                        : { printed: Math.max(1, Math.floor(Number(e.target.value) || 1)) },
                    )
                  }
                />
              </label>
              <label className="mini-control" title="四周出血 (mm)">
                出血
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={page.bleed}
                  onChange={(e) =>
                    onChange(page.id, { bleed: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
              <button
                type="button"
                className={`mini-btn ${page.inverted ? 'mini-btn--on' : ''}`}
                title="来稿倒置 180°"
                onClick={() => onChange(page.id, { inverted: !page.inverted })}
              >
                倒置
              </button>
              <button
                type="button"
                className="mini-btn mini-btn--danger"
                title="删除该页"
                onClick={() => onDelete(page.id)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className="btn btn--block" onClick={addPage}>
        ＋ 增加页面
      </button>
      <p className="hint">拖动卡片可调整阅读顺序；页数不足 4 的倍数时自动在封底前补白。</p>
    </aside>
  );
}
