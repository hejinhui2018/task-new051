import { useEffect, useMemo, useState } from 'react';
import type { ArtPage } from './types';
import { usePersistedState } from './state';
import { buildImposition } from './lib/imposition';
import { diagnose } from './lib/diagnostics';
import { PageList } from './components/PageList';
import { SheetCard } from './components/SheetCard';
import { IssuesPanel } from './components/IssuesPanel';
import { PreviewModal } from './components/PreviewModal';

export default function App() {
  const [state, setState] = usePersistedState();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const imp = useMemo(() => buildImposition(state.pages, state.flip), [state.pages, state.flip]);
  const issues = useMemo(() => diagnose(imp.pages), [imp.pages]);

  // 页面减少后，把预演位置收敛到合法范围
  useEffect(() => {
    if (state.previewIndex > imp.paddedCount - 1) {
      setState((s) => ({ ...s, previewIndex: Math.max(0, imp.paddedCount - 1) }));
    }
  }, [imp.paddedCount, state.previewIndex, setState]);

  const patch = (p: Partial<typeof state>) => setState((s) => ({ ...s, ...p }));

  const handleReorder = (pages: ArtPage[]) => patch({ pages });
  const handleAdd = (page: ArtPage) => patch({ pages: [...state.pages, page] });
  const handleDelete = (id: string) => patch({ pages: state.pages.filter((p) => p.id !== id) });
  const handleChange = (id: string, p: Partial<ArtPage>) =>
    patch({ pages: state.pages.map((pg) => (pg.id === id ? { ...pg, ...p } : pg)) });

  const errorCount = issues.filter((i) => i.level === 'error').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1>骑马钉拼版台</h1>
          <span className="muted">送印前看清每张印张与折叠后的真实页序</span>
        </div>

        <div className="topbar__tools">
          <div className="flip-switch" role="group" aria-label="翻面方式">
            <button
              type="button"
              className={state.flip === 'long' ? 'is-active' : ''}
              onClick={() => patch({ flip: 'long' })}
            >
              长边翻面
              <small>左右翻 · 书本式</small>
            </button>
            <button
              type="button"
              className={state.flip === 'short' ? 'is-active' : ''}
              onClick={() => patch({ flip: 'short' })}
            >
              短边翻面
              <small>上下翻 · 台历式</small>
            </button>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => patch({ previewOpen: true })}
            disabled={imp.paddedCount === 0}
          >
            📖 折叠预演
          </button>
        </div>
      </header>

      <div className="summary-bar">
        <span>内容稿 <b>{state.pages.length}</b> 页</span>
        <span>自动补白 <b>{imp.addedBlanks}</b> 页</span>
        <span>成书 <b>{imp.paddedCount}</b> 页 · <b>{imp.sheets.length}</b> 张印张</span>
        <span className={errorCount > 0 ? 'summary-bar--bad' : 'summary-bar--ok'}>
          {errorCount > 0 ? `⚠ ${errorCount} 个版面错误` : '✓ 版面检查通过'}
        </span>
      </div>

      <main className="layout">
        <PageList
          pages={state.pages}
          onReorder={handleReorder}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onChange={handleChange}
        />

        <section className="sheet-area">
          <div className="panel-head">
            <h2>印张拼版（{state.flip === 'long' ? '长边翻面' : '短边翻面'}）</h2>
            <span className="muted">中缝为折口/装订位，虚线为裁切线，外圈色带为出血区</span>
          </div>
          {imp.sheets.length === 0 ? (
            <p className="hint">暂无页面，请在左侧增加至少一个页面。</p>
          ) : (
            <div className="sheet-stack">
              {imp.sheets.map((sheet) => (
                <SheetCard
                  key={sheet.index}
                  sheet={sheet}
                  flip={state.flip}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                />
              ))}
            </div>
          )}
        </section>

        <IssuesPanel
          issues={issues}
          onJump={(pageIndex) => {
            patch({ previewOpen: true, previewIndex: pageIndex });
          }}
        />
      </main>

      {state.previewOpen && imp.paddedCount > 0 && (
        <PreviewModal
          imp={imp}
          index={Math.min(state.previewIndex, imp.paddedCount - 1)}
          issues={issues}
          onNavigate={(previewIndex) => patch({ previewIndex })}
          onClose={() => patch({ previewOpen: false })}
        />
      )}
    </div>
  );
}
