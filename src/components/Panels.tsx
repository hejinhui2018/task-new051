import { useState } from 'react';
import { STEP_MAP, STEPS } from '../engine/flow';
import { versionCandidates } from '../engine/engine';
import type { RunRecord, SimState } from '../engine/types';
import { Timeline } from './Timeline';

const OWNER_LABEL = { product: '产品', design: '设计', legal: '法务' } as const;

function CtxPanel({ sim }: { sim: SimState }) {
  const entries = Object.entries(sim.ctx);
  return (
    <div className="panel" style={{ flex: '0 0 auto', maxHeight: 200 }}>
      <div className="panel-head">
        <b>运行上下文</b>
        <span>设备 {sim.config.device} · 地区 {sim.config.region}</span>
      </div>
      <div className="panel-body">
        {entries.length === 0 ? (
          <div className="ctx-empty">（空）用户选择与确认结果会写入这里；返回修改时按键回收。</div>
        ) : (
          <div className="ctx-grid">
            {entries.map(([k, v]) => (
              <FragmentRow key={k} k={k} v={String(v)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="k">{k}</span>
      <span className="val">{v}</span>
    </>
  );
}

function VersionsPanel({ sim }: { sim: SimState }) {
  const stepId = sim.current && sim.nodes[sim.current]?.status === 'shown' ? sim.current : sim.path[sim.path.length - 1];
  const [selected, setSelected] = useState<string | null>(null);
  const id = selected ?? stepId ?? null;
  const step = id ? STEP_MAP[id] : null;
  const scope = { ctx: sim.ctx, device: sim.config.device, region: sim.config.region };
  return (
    <div className="panel grow">
      <div className="panel-head">
        <b>版本命中检查</b>
        {step ? <span>{step.id}</span> : null}
      </div>
      <div className="panel-body">
        {!step ? (
          <div className="ctx-empty">运行后展示当前步骤的全部版本候选及命中原因。</div>
        ) : (
          <>
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${s.id === step.id ? 'on' : ''}`}
                  onClick={() => setSelected(s.id)}
                >
                  {s.id}
                </button>
              ))}
            </div>
            {versionCandidates(step, scope).map((c) => {
              const picked = sim.selectedVersions[step.id] === c.version;
              return (
                <div key={c.version} className={`ver-row ${picked ? 'picked' : ''}`}>
                  <span className="vname">{c.version}</span>
                  <span className={`vowner ${c.owner}`}>{OWNER_LABEL[c.owner]}</span>
                  <span className="vchange">{STEP_MAP[step.id].versions.find((v) => v.version === c.version)?.changelog}</span>
                  <span className={`match-pill ${c.match === null ? 'base' : c.match ? 'yes' : 'no'}`}>
                    {c.match === null ? '基线兜底' : c.match ? '条件命中' : '条件不成立'}
                  </span>
                  {picked && <span className="match-pill yes">当前使用</span>}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryPanel({ sim }: { sim: SimState }) {
  const counts = {
    unseen: 0,
    shown: 0,
    confirmed: 0,
    skipped: 0,
    condition_failed: 0,
    invalidated: 0,
    loading: 0,
  };
  for (const s of STEPS) {
    const st = sim.nodes[s.id]?.status ?? 'unseen';
    counts[st] += 1;
  }
  return (
    <div className="summary-row">
      <span className="metric unseen"><b>{counts.unseen}</b>未展示</span>
      <span className="metric shown"><b>{counts.shown + counts.loading}</b>已展示/加载</span>
      <span className="metric confirmed"><b>{counts.confirmed}</b>已确认</span>
      <span className="metric skipped"><b>{counts.skipped}</b>主动跳过</span>
      <span className="metric condition_failed"><b>{counts.condition_failed}</b>条件不满足</span>
      <span className="metric invalidated"><b>{counts.invalidated}</b>已失效</span>
    </div>
  );
}

function HistoryPanel({ history, onInspect }: { history: RunRecord[]; onInspect: (r: RunRecord) => void }) {
  return (
    <div className="panel grow">
      <div className="panel-head">
        <b>历史运行（{history.length}）</b>
        <span>点击查看该次运行的留痕与版本路径</span>
      </div>
      <div className="panel-body">
        {history.length === 0 && <div className="ctx-empty">完成的运行会归档于此，便于对比版本边界与重复运行差异。</div>}
        {history.map((r) => {
          const skipped = Object.values(r.nodes).filter((n) => n.status === 'skipped').length;
          const blocked = Object.values(r.nodes).reduce((a, n) => a + n.blocked.length, 0);
          const condFail = Object.values(r.nodes).filter((n) => n.status === 'condition_failed').length;
          return (
            <div key={r.runId} className="run-card" onClick={() => onInspect(r)}>
              <div className="top">
                <span className="rid">{r.runId}</span>
                <span>
                  <i className="status-dot" style={{ background: '#3fb950' }} />
                  {r.durationMs / 1000}s
                </span>
              </div>
              <div className="stats">
                <span>{r.config.device}/{r.config.region}/{r.config.personaId}</span>
                <span>路径 <b>{r.path.length}</b></span>
                <span>跳过 <b>{skipped}</b></span>
                <span>拦截 <b>{blocked}</b></span>
                <span>条件不满足 <b>{condFail}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RightColumn({
  sim,
  history,
  tab,
  setTab,
  onInspect,
}: {
  sim: SimState;
  history: RunRecord[];
  tab: 'events' | 'history';
  setTab: (t: 'events' | 'history') => void;
  onInspect: (r: RunRecord) => void;
}) {
  return (
    <div className="col">
      <CtxPanel sim={sim} />
      <div className="panel grow">
        <div className="tabs">
          <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
            事件留痕（{sim.events.length}）
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            历史运行（{history.length}）
          </button>
        </div>
        {tab === 'events' ? (
          <>
            <SummaryPanel sim={sim} />
            <Timeline events={sim.events} />
          </>
        ) : (
          <HistoryPanel history={history} onInspect={onInspect} />
        )}
      </div>
      <VersionsPanel sim={sim} />
    </div>
  );
}
