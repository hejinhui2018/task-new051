import { STEPS } from '../engine/flow';
import type { NodeStatus, SimState } from '../engine/types';
import { store } from '../hooks';

const W = 172;
const H = 62;

const STATUS_TEXT: Record<NodeStatus, string> = {
  unseen: '未展示',
  loading: '加载中',
  condition_failed: '条件不满足',
  shown: '已展示',
  confirmed: '已确认',
  skipped: '主动跳过',
  invalidated: '已失效',
};

const STATUS_FILL: Record<NodeStatus, string> = {
  unseen: '#64748b',
  loading: '#e3a008',
  condition_failed: '#7db6ee',
  shown: '#39c5cf',
  confirmed: '#3fb950',
  skipped: '#e3a008',
  invalidated: '#bc8cff',
};

const SHORT_TITLE: Record<string, string> = {
  welcome: '欢迎',
  account_type: '账户类型',
  profile_form: '资料表单',
  privacy_consent: '隐私授权',
  enterprise_verify: '企业验证',
  invite_team: '团队邀请',
  notification_pref: '通知偏好',
  legal_terms: '服务条款',
  done: '完成',
};

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(34, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function FlowGraph({ sim }: { sim: SimState }) {
  const visited = new Set(sim.path);

  return (
    <div className="graph-wrap">
      <svg width={1560} height={360}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a4860" />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3fb950" />
          </marker>
        </defs>

        {STEPS.map((step) =>
          step.edges.map((edge) => {
            const to = STEPS.find((s) => s.id === edge.to)!;
            const evals = sim.edgeEvals[edge.id];
            const last = evals?.[evals.length - 1];
            const taken = last?.result === true;
            const evaluatedFalse = last?.result === false;
            const cls = taken ? 'taken' : evaluatedFalse ? 'evaluated-false' : '';
            const x1 = step.pos.x + W;
            const y1 = step.pos.y + H / 2;
            const x2 = to.pos.x;
            const y2 = to.pos.y + H / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 - 6;
            return (
              <g key={edge.id}>
                <path
                  d={edgePath(x1, y1, x2 - 4, y2)}
                  className={`edge-path ${cls}`}
                  markerEnd={taken ? 'url(#arrow-green)' : 'url(#arrow)'}
                />
                {edge.label && (
                  <text x={mx} y={my} className={`edge-label ${taken ? 'taken' : ''}`} textAnchor="middle">
                    {edge.label}
                    {evals ? ` ${taken ? '✓' : '✗'}` : ''}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {STEPS.map((step) => {
          const ns = sim.nodes[step.id];
          const status: NodeStatus = ns?.status ?? 'unseen';
          const isCurrent = sim.current === step.id;
          const canRerun = visited.has(step.id) && sim.status !== 'idle';
          return (
            <g
              key={step.id}
              className={`node-card ${status} ${isCurrent ? 'current' : ''}`}
              transform={`translate(${step.pos.x},${step.pos.y})`}
            >
              <rect className="box" width={W} height={H} />
              <text x={10} y={19} className="node-title">
                {SHORT_TITLE[step.id] ?? step.id}
                {step.required ? <tspan fill="#f85149"> *</tspan> : null}
              </text>
              <text x={10} y={36} className="node-meta">
                {ns?.version ? `${ns.version} · ` : ''}
                {STATUS_TEXT[status]}
              </text>
              <rect x={8} y={44} width={9} height={9} rx={2} fill={STATUS_FILL[status]} />
              <text x={22} y={52} className="node-meta">
                {step.id}
              </text>
              {canRerun && (
                <g
                  transform={`translate(${W - 22}, 6)`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    store.dispatch({ t: 'rerun', stepId: step.id, input: 'click' });
                  }}
                >
                  <title>从该节点重跑（下游失效、上下文回收）</title>
                  <circle r={9} fill="#223046" stroke="#3b4a63" />
                  <text textAnchor="middle" y={3.5} fontSize={10} fill="#93a1b5" fontWeight={700}>
                    ↺
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: '未展示', color: '#64748b' },
  { label: '已展示/当前', color: '#39c5cf' },
  { label: '已确认', color: '#3fb950' },
  { label: '主动跳过', color: '#e3a008' },
  { label: '条件不满足', color: '#7db6ee' },
  { label: '已失效（回退/重跑）', color: '#bc8cff' },
];
