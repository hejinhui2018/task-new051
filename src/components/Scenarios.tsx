import { useState } from 'react';
import { runScenario, SCENARIOS, type ScenarioResult } from '../engine/scenarios';
import type { RunRecord } from '../engine/types';
import { Timeline } from './Timeline';

export function ScenariosPanel({ onApplyConfig }: { onApplyConfig: (c: { device: string; region: string; personaId: string }) => void }) {
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});

  const runOne = (id: string) => {
    const sc = SCENARIOS.find((s) => s.id === id)!;
    const r = runScenario(sc);
    setResults((prev) => ({ ...prev, [id]: r }));
  };
  const runAll = () => {
    const next: Record<string, ScenarioResult> = {};
    for (const sc of SCENARIOS) next[sc.id] = runScenario(sc);
    setResults(next);
  };

  const total = Object.values(results).reduce((a, r) => a + r.results.length, 0);
  const passed = Object.values(results).reduce(
    (a, r) => a + r.results.filter((x) => x.pass).length,
    0,
  );

  return (
    <div className="panel" style={{ flex: '0 0 42%', minHeight: 160 }}>
      <div className="panel-head">
        <b>验收脚本</b>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {total > 0 && (
            <span style={{ color: passed === total ? 'var(--green)' : 'var(--red)' }}>
              {passed}/{total} 通过
            </span>
          )}
          <button className="primary" onClick={runAll}>
            全部运行
          </button>
        </span>
      </div>
      <div className="panel-body" style={{ paddingBottom: 8 }}>
        {SCENARIOS.map((sc) => {
          const r = results[sc.id];
          const ok = r && r.results.every((x) => x.pass);
          return (
            <div className="scenario" key={sc.id}>
              <div className="st">
                {ok ? '✅' : r ? '❌' : '▫️'} {sc.title}
              </div>
              <div className="sd">{sc.desc}</div>
              <div className="expect">
                预期：
                {sc.expect.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => runOne(sc.id)}>运行此场景</button>
                <button
                  className="ghost"
                  onClick={() => onApplyConfig(sc.config)}
                  title="把该场景的设备/地区/策略载入顶栏，手动复现"
                >
                  载入配置
                </button>
              </div>
              {r && (
                <div style={{ marginTop: 6 }}>
                  {r.results.map((c, i) => (
                    <div key={i} className={`result-line ${c.pass ? 'pass' : 'fail'}`}>
                      {c.pass ? '✓' : '✗'} {c.desc}
                      {c.detail ? `（${c.detail}）` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HistoryModal({ record, onClose }: { record: RunRecord; onClose: () => void }) {
  const versions = Object.entries(record.selectedVersions)
    .map(([step, v]) => `${step}=${v}`)
    .join('  ');
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,8,14,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 'min(820px, 92vw)', height: 'min(680px, 88vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <b>运行回放 · {record.runId}</b>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {record.config.device}/{record.config.region}/{record.config.personaId} · 耗时{' '}
            {(record.durationMs / 1000).toFixed(2)}s
            <button onClick={onClose}>关闭</button>
          </span>
        </div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-dim)' }}>
          <div>版本路径：{versions}</div>
          <div>
            最终上下文：
            {Object.entries(record.ctx).map(([k, v]) => (
              <span key={k} style={{ marginLeft: 8, fontFamily: 'ui-monospace,monospace', color: 'var(--green)' }}>
                {k}={String(v)}
              </span>
            ))}
          </div>
        </div>
        <Timeline events={record.events} />
      </div>
    </div>
  );
}
