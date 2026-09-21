import { evalExpr } from './conditions';
import { ENTRY_STEP, STEP_MAP, STEPS } from './flow';
import type {
  Cmd,
  ConditionScope,
  Ctx,
  Effect,
  NodeState,
  NodeStatus,
  ReduceResult,
  RunConfig,
  SimState,
  StepDef,
  StepVersion,
  TraceEvent,
} from './types';

const SLOW_RENDER_MS = 1200;

let runCounter = 0;
function newRunId(): string {
  runCounter += 1;
  return `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${runCounter}`;
}

export function defaultNode(): NodeState {
  return { status: 'unseen', setKeys: [], blocked: [], renders: 0 };
}

export function createInitialState(): SimState {
  return {
    runId: '',
    status: 'idle',
    config: { device: 'desktop', region: 'CN', personaId: 'cooperative' },
    ctx: {},
    current: null,
    path: [],
    nodes: Object.fromEntries(STEPS.map((s) => [s.id, defaultNode()])),
    events: [],
    edgeEvals: {},
    selectedVersions: {},
    armedFault: null,
    seq: 0,
    startedAt: 0,
    endedAt: null,
    interruptedFrom: null,
  };
}

export function scopeOf(state: SimState): ConditionScope {
  return { ctx: state.ctx, device: state.config.device, region: state.config.region };
}

/**
 * 版本命中：第一个 when 为真的版本胜出；
 * 没有条件命中时，在无 when 的基线版本中取 publishedAt 最新者（旧基线自然退场但保留留痕）。
 */
export function resolveVersion(step: StepDef, scope: ConditionScope): StepVersion {
  for (const v of step.versions) {
    if (v.when && evalExpr(v.when, scope)) return v;
  }
  const baselines = step.versions
    .filter((v) => !v.when)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return baselines[0] ?? step.versions[0];
}

export function versionCandidates(step: StepDef, scope: ConditionScope) {
  return step.versions.map((v) => ({
    version: v.version,
    owner: v.owner,
    publishedAt: v.publishedAt,
    match: v.when ? evalExpr(v.when, scope) : null, // null = 基线兜底
  }));
}

/** 必填校验：缺项即“被挡住的必要确认”，全部进事件留痕 */
export function missingRequirements(v: StepVersion, choiceId: string | undefined, values: Ctx): string[] {
  const missing: string[] = [];
  if (v.kind === 'choice' && !choiceId) missing.push('未选择选项');
  for (const f of v.fields ?? []) {
    if (!f.required) continue;
    const val = values[f.key];
    if (f.type === 'checkbox') {
      if (val !== true) missing.push(`未勾选「${f.label}」`);
    } else if (typeof val !== 'string' || val.trim() === '') {
      missing.push(`未填写「${f.label}」`);
    }
  }
  return missing;
}

// ---------- 内部可变工具（reducer 先深拷贝再调用） ----------

interface Mut {
  s: SimState;
  effects: Effect[];
}

function pushEvent(m: Mut, e: Omit<TraceEvent, 'seq' | 'at' | 'runId'>): TraceEvent {
  const ev: TraceEvent = {
    seq: m.s.seq,
    at: Date.now() - m.s.startedAt,
    runId: m.s.runId,
    ...e,
  };
  m.s.seq += 1;
  m.s.events.push(ev);
  return ev;
}

function node(m: Mut, id: string): NodeState {
  return (m.s.nodes[id] ??= defaultNode());
}

function applySets(m: Mut, stepId: string, sets: Ctx | undefined) {
  if (!sets) return;
  const ns = node(m, stepId);
  for (const [k, v] of Object.entries(sets)) {
    m.s.ctx[k] = v;
    if (!ns.setKeys.includes(k)) ns.setKeys.push(k);
  }
}

function reclaimKeys(m: Mut, ids: string[]) {
  for (const id of ids) {
    const ns = m.s.nodes[id];
    if (!ns) continue;
    for (const k of ns.setKeys) delete m.s.ctx[k];
    ns.setKeys = [];
  }
}

function recordEdgeEvals(m: Mut, step: StepDef): string | null {
  const scope = scopeOf(m.s);
  let taken: string | null = null;
  for (const edge of step.edges) {
    const result = edge.when ? evalExpr(edge.when, scope) : true;
    const list = (m.s.edgeEvals[edge.id] ??= []);
    list.push({ result, seq: m.s.seq, at: Date.now() - m.s.startedAt });
    pushEvent(m, {
      type: 'edge_eval',
      stepId: step.id,
      edgeId: edge.id,
      message: `条件边 ${edge.id} → ${edge.to}：${edge.when ? (result ? '满足，走这条' : '不满足') : '无条件边'}`,
      data: { to: edge.to, result, label: edge.label ?? null },
    });
    if (taken === null && result) taken = edge.to;
  }
  return taken;
}

function enter(m: Mut, stepId: string, opts?: { viaRerun?: boolean }) {
  const step = STEP_MAP[stepId];
  const ns = node(m, stepId);
  m.s.current = stepId;
  if (!m.s.path.includes(stepId)) m.s.path.push(stepId);

  // 版本解析（含所有候选命中情况，用于版本边界验收）
  const scope = scopeOf(m.s);
  const picked = resolveVersion(step, scope);
  const candidates = versionCandidates(step, scope);
  const prevVersion = m.s.selectedVersions[stepId];
  m.s.selectedVersions[stepId] = picked.version;
  ns.version = picked.version;
  pushEvent(m, {
    type: 'version_resolved',
    stepId,
    version: picked.version,
    message:
      prevVersion && prevVersion !== picked.version
        ? `版本边界：${stepId} 由 ${prevVersion} 切换为 ${picked.version}（${picked.owner}）`
        : `命中版本 ${picked.version}（${picked.owner}）：${picked.changelog}`,
    data: { candidates, picked: picked.version, owner: picked.owner },
  });

  // 入口可见条件
  if (step.visible && !evalExpr(step.visible, scope)) {
    ns.status = 'condition_failed';
    pushEvent(m, {
      type: 'condition_failed',
      stepId,
      version: picked.version,
      message: `条件不满足：步骤「${picked.title}」未展示，自动顺延（visible=false）`,
      data: { visible: false },
    });
    const next = recordEdgeEvals(m, step);
    if (next) enter(m, next);
    else finish(m);
    return;
  }

  // 故障注入：慢加载
  if (m.s.armedFault === 'slow-render') {
    m.s.armedFault = null;
    ns.status = 'loading';
    pushEvent(m, {
      type: 'fault_slow_start',
      stepId,
      version: picked.version,
      message: `故障注入：步骤「${picked.title}」渲染延迟 ${SLOW_RENDER_MS}ms`,
    });
    m.effects.push({ type: 'dispatch', delayMs: SLOW_RENDER_MS, cmd: { t: 'renderComplete', stepId } });
    return;
  }

  ns.status = 'shown';
  ns.enteredSeq = m.s.seq;
  ns.renders += 1;
  pushEvent(m, {
    type: 'step_shown',
    stepId,
    version: picked.version,
    message: `展示步骤「${picked.title}」（${picked.version}），可跳过=${picked.skippable}，必要确认=${step.required}`,
    data: { viaRerun: opts?.viaRerun ?? false, renders: ns.renders },
  });
}

function finish(m: Mut) {
  m.s.status = 'completed';
  m.s.current = null;
  m.s.endedAt = Date.now();
  pushEvent(m, { type: 'run_completed', message: '引导完成' });
}

/** 确认/跳过后：求值边、进入下一节点；无边则完成 */
function advance(m: Mut, fromId: string) {
  const step = STEP_MAP[fromId];
  if (step.edges.length === 0) {
    finish(m);
    return;
  }
  const next = recordEdgeEvals(m, step);
  if (next) enter(m, next);
  else finish(m);
}

/** 返回修改 / 从节点重跑共用：截断到目标节点，失效化并回收下游写入 */
function truncateFrom(m: Mut, targetId: string, kind: 'back' | 'rerun'): NodeStatus {
  const idx = m.s.path.indexOf(targetId);
  const tail = idx >= 0 ? m.s.path.slice(idx + (kind === 'rerun' ? 0 : 1)) : [];
  for (const id of tail) {
    const ns = m.s.nodes[id];
    if (ns && ['confirmed', 'skipped', 'shown', 'condition_failed', 'loading'].includes(ns.status)) {
      const was = ns.status;
      ns.status = 'invalidated';
      ns.blocked = [];
      pushEvent(m, {
        type: 'node_invalidated',
        stepId: id,
        version: ns.version,
        message:
          was === 'condition_failed'
            ? `路径失效：${id} 的“条件不满足”结论作废，将按新上下文重新判定`
            : `返回修改：${id} 的结果已失效（原为 ${was}），其写入的上下文将回收`,
        data: { previousStatus: was, reclaimedKeys: [...ns.setKeys] },
      });
    }
  }
  reclaimKeys(m, tail);
  m.s.path = idx >= 0 ? m.s.path.slice(0, idx + 1) : m.s.path;
  return 'shown';
}

function startRun(m: Mut, config: RunConfig) {
  const fresh = createInitialState();
  m.s.nodes = fresh.nodes;
  m.s.events = fresh.events;
  m.s.edgeEvals = {};
  m.s.selectedVersions = {};
  m.s.ctx = {};
  m.s.path = [];
  m.s.current = null;
  m.s.seq = 0;
  m.s.endedAt = null;
  m.s.interruptedFrom = null;
  m.s.runId = newRunId();
  m.s.config = config;
  m.s.status = 'running';
  m.s.startedAt = Date.now();
  pushEvent(m, {
    type: 'run_started',
    device: config.device,
    message: `开始运行 ${m.s.runId}：设备=${config.device} 地区=${config.region} 拟人策略=${config.personaId}`,
    data: { config },
  });
  enter(m, ENTRY_STEP);
}

function consumeActionFault(m: Mut, stepId: string, action: string): boolean {
  if (m.s.armedFault === 'action-fail') {
    m.s.armedFault = null;
    const ns = node(m, stepId);
    ns.blocked.push({ seq: m.s.seq, reason: '注入故障：操作提交失败（网络抖动）', input: 'click' });
    pushEvent(m, {
      type: 'fault_action_fail',
      stepId,
      version: ns.version,
      message: `故障注入：${action}提交失败，停留在当前步骤，可重试`,
      data: { action },
    });
    return true;
  }
  if (m.s.armedFault === 'crash') {
    m.s.armedFault = null;
    m.s.status = 'interrupted';
    m.s.interruptedFrom = stepId;
    pushEvent(m, {
      type: 'fault_crash',
      stepId,
      version: node(m, stepId).version,
      message: `故障注入：应用崩溃，运行中断待恢复（进度已持久化）`,
    });
    return true;
  }
  return false;
}

// ---------- reducer ----------

export function reduce(prev: SimState, cmd: Cmd): ReduceResult {
  const s: SimState = structuredClone(prev);
  const m: Mut = { s, effects: [] };

  switch (cmd.t) {
    case 'start': {
      startRun(m, cmd.config);
      return { state: s, effects: m.effects };
    }
    case 'reset':
      return { state: createInitialState(), effects: [] };
    case 'armFault':
      s.armedFault = cmd.kind;
      pushEvent(m, {
        type: cmd.kind ? 'fault_armed' : 'fault_disarmed',
        message: cmd.kind ? `已布防故障：${cmd.kind}（下一次相关操作触发，一次性）` : '已撤销故障布防',
        data: { kind: cmd.kind },
      });
      return { state: s, effects: [] };
    default:
      break;
  }

  if (s.status === 'idle') return { state: s, effects: [] };

  switch (cmd.t) {
    case 'interrupt': {
      if (s.status !== 'running' || !s.current) return { state: s, effects: [] };
      const from = s.current;
      s.status = 'interrupted';
      s.interruptedFrom = from;
      pushEvent(m, { type: 'interrupted', stepId: from, version: node(m, from).version, message: `手动中断：离开 ${from}，状态待恢复` });
      return { state: s, effects: [] };
    }
    case 'resume': {
      if (s.status !== 'interrupted' || !s.interruptedFrom) return { state: s, effects: [] };
      const from = s.interruptedFrom;
      s.status = 'running';
      s.current = from;
      s.interruptedFrom = null;
      const ns = node(m, from);
      if (ns.status === 'loading') {
        // 崩溃发生在加载中：恢复后补一个渲染完成
        ns.status = 'shown';
        ns.renders += 1;
      } else if (ns.status !== 'condition_failed') {
        ns.status = 'shown';
      }
      pushEvent(m, { type: 'resumed', stepId: from, version: ns.version, message: `中断恢复：回到「${STEP_MAP[from].id}」继续` });
      return { state: s, effects: [] };
    }
    case 'rerun': {
      if (!STEPS.some((x) => x.id === cmd.stepId) || s.path.length === 0) return { state: s, effects: [] };
      truncateFrom(m, cmd.stepId, 'rerun');
      s.status = 'running';
      s.interruptedFrom = null;
      s.endedAt = null;
      pushEvent(m, { type: 'rerun_started', stepId: cmd.stepId, input: cmd.input, message: `从节点 ${cmd.stepId} 重跑：该节点及其下游全部重新执行` });
      enter(m, cmd.stepId, { viaRerun: true });
      return { state: s, effects: m.effects };
    }
    case 'renderComplete': {
      const ns = s.nodes[cmd.stepId];
      if (!ns || ns.status !== 'loading') return { state: s, effects: [] };
      ns.status = 'shown';
      ns.enteredSeq = s.seq;
      ns.renders += 1;
      const v = resolveVersion(STEP_MAP[cmd.stepId], scopeOf(s));
      pushEvent(m, { type: 'fault_slow_end', stepId: cmd.stepId, version: v.version, message: `延迟渲染完成，步骤可操作` });
      return { state: s, effects: [] };
    }
    default:
      break;
  }

  if (s.status !== 'running' || !s.current) return { state: s, effects: [] };
  const curId = s.current;
  const step = STEP_MAP[curId];
  const ns = node(m, curId);
  if (ns.status === 'loading') {
    pushEvent(m, { type: 'blocked_loading', stepId: curId, message: '步骤仍在加载，操作被忽略' });
    return { state: s, effects: [] };
  }
  const version = step.versions.find((v) => v.version === ns.version) ?? resolveVersion(step, scopeOf(s));

  if (cmd.t === 'back') {
    // 找上一个真正可交互的节点（跳过 condition_failed）
    let target: string | null = null;
    for (let i = s.path.length - 2; i >= 0; i--) {
      const st = s.nodes[s.path[i]];
      if (st && ['confirmed', 'skipped', 'shown'].includes(st.status)) {
        target = s.path[i];
        break;
      }
    }
    if (!target) {
      pushEvent(m, { type: 'back_blocked', stepId: curId, input: cmd.input, message: '已是第一步，无法返回' });
      return { state: s, effects: [] };
    }
    truncateFrom(m, target, 'back');
    pushEvent(m, { type: 'back', stepId: curId, input: cmd.input, message: `返回修改：回到 ${target}，下游结果已失效` });
    enter(m, target);
    return { state: s, effects: m.effects };
  }

  if (cmd.t === 'skip') {
    if (consumeActionFault(m, curId, '跳过')) return { state: s, effects: [] };
    if (!version.skippable) {
      ns.blocked.push({ seq: s.seq, reason: step.required ? '必要确认：该版本不允许跳过' : '该版本不允许跳过', input: cmd.input });
      pushEvent(m, {
        type: 'skip_blocked',
        stepId: curId,
        version: version.version,
        input: cmd.input,
        message: step.required
          ? `主动跳过被拦截：「${version.title}」是必要确认（${version.owner} 的 ${version.version} 不可跳过）`
          : `跳过被拦截：当前版本不提供跳过入口`,
        data: { required: step.required },
      });
      return { state: s, effects: [] };
    }
    applySets(m, curId, version.setsOnSkip);
    ns.status = 'skipped';
    pushEvent(m, {
      type: 'skipped',
      stepId: curId,
      version: version.version,
      input: cmd.input,
      message: `主动跳过：「${version.title}」`,
      data: { sets: version.setsOnSkip ?? {}, required: step.required },
    });
    advance(m, curId);
    return { state: s, effects: m.effects };
  }

  if (cmd.t === 'primary') {
    if (consumeActionFault(m, curId, '主操作')) return { state: s, effects: [] };
    const values = cmd.values ?? {};
    const missing = missingRequirements(version, cmd.choiceId, values);
    if (missing.length > 0) {
      ns.blocked.push({ seq: s.seq, reason: missing.join('；'), input: cmd.input });
      pushEvent(m, {
        type: 'confirm_blocked',
        stepId: curId,
        version: version.version,
        input: cmd.input,
        message: `确认被拦截：「${version.title}」缺少必要确认 —— ${missing.join('；')}`,
        data: { missing, required: step.required },
      });
      return { state: s, effects: [] };
    }
    const sets: Ctx = { ...(version.setsOnConfirm ?? {}) };
    if (cmd.choiceId) {
      const ch = version.choices?.find((c) => c.id === cmd.choiceId);
      Object.assign(sets, ch?.sets ?? {});
      pushEvent(m, {
        type: 'choice_selected',
        stepId: curId,
        version: version.version,
        input: cmd.input,
        message: `选择「${ch?.label ?? cmd.choiceId}」`,
        data: { choiceId: cmd.choiceId, sets: ch?.sets ?? {} },
      });
    }
    for (const f of version.fields ?? []) applySets(m, curId, { [f.key]: values[f.key] });
    applySets(m, curId, sets);
    ns.status = 'confirmed';
    pushEvent(m, {
      type: 'confirmed',
      stepId: curId,
      version: version.version,
      input: cmd.input,
      message: `确认：「${version.title}」`,
      data: { sets, values },
    });
    advance(m, curId);
    return { state: s, effects: m.effects };
  }

  return { state: s, effects: [] };
}
