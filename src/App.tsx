import { useState } from 'react';
import { store, useStore } from './hooks';
import { PERSONAS } from './engine/personas';
import type { DeviceType, FaultKind, PersonaId, Region, RunRecord } from './engine/types';
import { FlowGraph, LEGEND_ITEMS } from './components/FlowGraph';
import { DeviceStage } from './components/DeviceStage';
import { RightColumn } from './components/Panels';
import { HistoryModal, ScenariosPanel } from './components/Scenarios';

const DEVICES: { id: DeviceType; label: string }[] = [
  { id: 'desktop', label: '桌面端' },
  { id: 'tablet', label: '平板' },
  { id: 'mobile', label: '手机' },
];
const REGIONS: Region[] = ['CN', 'US', 'EU'];

const STATUS_LABEL = { idle: '未开始', running: '运行中', interrupted: '中断待恢复', completed: '已完成' } as const;

const FAULTS: { id: FaultKind; label: string; hint: string }[] = [
  { id: 'action-fail', label: '提交失败', hint: '下一次确认/跳过模拟网络失败' },
  { id: 'slow-render', label: '慢加载', hint: '下一个进入的步骤延迟 1.2s 渲染' },
  { id: 'crash', label: '崩溃', hint: '下一次确认时应用崩溃，进入中断待恢复' },
];

export default function App() {
  const snap = useStore();
  const { sim } = snap;
  const [device, setDevice] = useState<DeviceType>('desktop');
  const [region, setRegion] = useState<Region>('CN');
  const [personaId, setPersonaId] = useState<PersonaId>('cooperative');
  const [tab, setTab] = useState<'events' | 'history'>('events');
  const [inspect, setInspect] = useState<RunRecord | null>(null);
  const [showScenarios, setShowScenarios] = useState(true);

  const start = () => store.dispatch({ t: 'start', config: { device, region, personaId } });
  const running = sim.status === 'running';

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>🔎 OnboardTrace</h1>
          <span className="sub">引导流程验收台 · 步骤版本 / 条件分支 / 返回修改 / 中断恢复</span>
        </div>

        <div className="group">
          <label>设备</label>
          <select value={device} onChange={(e) => setDevice(e.target.value as DeviceType)}>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <label>地区</label>
          <select value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label>拟人</label>
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value as PersonaId)} title={PERSONAS.find((p) => p.id === personaId)?.desc}>
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={start}>
            {sim.status === 'idle' ? '开始运行' : '新运行'}
          </button>
        </div>

        <div className="group">
          <button onClick={() => store.singleStep()} disabled={!running} title="按拟人策略执行一个操作">
            ⏭ 单步
          </button>
          <button
            className={snap.autoPlaying ? 'active' : ''}
            onClick={() => store.toggleAuto()}
            disabled={!running && !snap.autoPlaying}
            title="自动播放拟人操作"
          >
            {snap.autoPlaying ? '⏸ 暂停' : '▶ 自动播放'}
          </button>
          <select
            value={snap.speed}
            onChange={(e) => store.setSpeed(Number(e.target.value))}
            title="播放速度"
            style={{ width: 72 }}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <button
            onClick={() => store.dispatch({ t: 'interrupt', reason: 'manual' })}
            disabled={!running}
            title="模拟用户中途离开（中断待恢复，刷新同样效果）"
          >
            ⏹ 中断
          </button>
          <button className="primary" onClick={() => store.dispatch({ t: 'resume' })} disabled={sim.status !== 'interrupted'}>
            ⤴ 恢复
          </button>
        </div>

        <div className="group">
          <button onClick={() => store.undo()} disabled={!snap.past.length} title="撤销上一步（含自动播放）">
            ↶ 撤销
          </button>
          <button onClick={() => store.redo()} disabled={!snap.future.length} title="重做">
            ↷ 重做
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('清空当前运行、撤销栈与本地存档？')) store.resetAll();
            }}
          >
            重置
          </button>
        </div>

        <div className="group">
          <label>故障注入</label>
          {FAULTS.map((f) => (
            <button
              key={f.id}
              className={sim.armedFault === f.id ? 'active' : ''}
              title={f.hint}
              onClick={() => store.armFault(sim.armedFault === f.id ? null : f.id)}
            >
              {sim.armedFault === f.id ? '🪤 ' : ''}
              {f.label}
            </button>
          ))}
        </div>

        <span className={`run-pill ${sim.status}`}>{STATUS_LABEL[sim.status]}</span>
        {sim.runId && <span className="run-pill">{sim.runId}</span>}
      </div>

      <div className="main">
        {/* 左：流程图 + 验收脚本 */}
        <div className="col">
          <div className="panel grow">
            <div className="panel-head">
              <b>引导流程图</b>
              <div className="legend">
                {LEGEND_ITEMS.map((l) => (
                  <span key={l.label}>
                    <i style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
                <span>
                  <i style={{ background: '#3fb950' }} />
                  已走条件边
                </span>
                <button
                  className="ghost"
                  style={{ padding: '0 6px' }}
                  onClick={() => setShowScenarios((v) => !v)}
                >
                  {showScenarios ? '收起脚本' : '展开脚本'}
                </button>
              </div>
            </div>
            <FlowGraph sim={sim} />
          </div>
          {showScenarios && <ScenariosPanel onApplyConfig={(c) => {
            setDevice(c.device as DeviceType);
            setRegion(c.region as Region);
            setPersonaId(c.personaId as PersonaId);
          }} />}
        </div>

        {/* 中：设备屏 */}
        <div className="col">
          <div className="panel grow">
            <div className="panel-head">
              <b>设备预览与操作</b>
              <span>真实点击 / 键盘操作，与自动播放共用同一条留痕</span>
            </div>
            <DeviceStage sim={sim} />
          </div>
        </div>

        {/* 右：上下文 + 时间线/历史 + 版本 */}
        <RightColumn sim={sim} history={snap.history} tab={tab} setTab={setTab} onInspect={setInspect} />
      </div>

      {inspect && <HistoryModal record={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
