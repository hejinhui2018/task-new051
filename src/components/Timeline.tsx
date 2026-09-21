import { useEffect, useMemo, useRef, useState } from 'react';
import { STEP_MAP } from '../engine/flow';
import type { TraceEvent } from '../engine/types';

type Cat = 'shown' | 'confirmed' | 'skipped' | 'blocked' | 'edge' | 'condition' | 'invalidated' | 'fault' | 'version' | 'system';

const CAT_OF: Record<string, Cat> = {
  step_shown: 'shown',
  confirmed: 'confirmed',
  choice_selected: 'confirmed',
  skipped: 'skipped',
  skip_blocked: 'blocked',
  confirm_blocked: 'blocked',
  back_blocked: 'blocked',
  blocked_loading: 'blocked',
  edge_eval: 'edge',
  condition_failed: 'condition',
  node_invalidated: 'invalidated',
  fault_slow_start: 'fault',
  fault_slow_end: 'fault',
  fault_action_fail: 'fault',
  fault_crash: 'fault',
  fault_armed: 'fault',
  fault_disarmed: 'fault',
  version_resolved: 'version',
  run_started: 'system',
  run_completed: 'system',
  interrupted: 'system',
  resumed: 'system',
  session_recovered: 'system',
  rerun_started: 'system',
  back: 'system',
};

const CLASS_OF: Record<Cat, string> = {
  shown: 't-shown',
  confirmed: 't-confirmed',
  skipped: 't-skipped',
  blocked: 't-blocked',
  edge: 't-edge',
  condition: 't-condition',
  invalidated: 't-invalidated',
  fault: 't-fault',
  version: 't-version',
  system: 't-system',
};

const FILTERS: { id: Cat; label: string }[] = [
  { id: 'shown', label: '展示' },
  { id: 'confirmed', label: '确认/选择' },
  { id: 'skipped', label: '主动跳过' },
  { id: 'blocked', label: '被拦截' },
  { id: 'edge', label: '条件边' },
  { id: 'condition', label: '条件不满足' },
  { id: 'invalidated', label: '失效化' },
  { id: 'fault', label: '故障' },
  { id: 'version', label: '版本命中' },
  { id: 'system', label: '系统' },
];

const INPUT_TAG: Record<string, string> = {
  click: '点击',
  keyboard: '键盘',
  auto: '自动',
};

function fmtAt(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function Timeline({ events }: { events: TraceEvent[] }) {
  const [on, setOn] = useState<Set<Cat>>(() => new Set(FILTERS.map((f) => f.id)));
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => events.filter((e) => on.has(CAT_OF[e.type] ?? 'system')), [events, on]);

  useEffect(() => {
    if (autoScroll && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [filtered.length, autoScroll]);

  const toggle = (c: Cat) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${on.has(f.id) ? 'on' : ''}`} onClick={() => toggle(f.id)}>
            {f.label}
          </button>
        ))}
        <button className={`chip ${autoScroll ? 'on' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => setAutoScroll((v) => !v)}>
          自动滚动 {autoScroll ? '开' : '关'}
        </button>
      </div>
      <div className="panel-body" ref={bodyRef}>
        {filtered.length === 0 && <div className="ctx-empty">暂无事件，开始一次运行。</div>}
        {filtered.map((e) => (
          <div key={`${e.runId}-${e.seq}`} className={`event ${CLASS_OF[CAT_OF[e.type] ?? 'system']}`}>
            <span className="seq">{e.seq}</span>
            <span className="time">{fmtAt(e.at)}</span>
            <span className="msg">
              {e.message}
              {e.stepId && STEP_MAP[e.stepId] ? (
                <span className="tag" style={{ marginLeft: 6 }}>
                  {e.stepId}
                </span>
              ) : null}
              {e.input ? <span className="tag">{INPUT_TAG[e.input] ?? e.input}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
