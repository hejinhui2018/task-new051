import { reduce } from './engine/engine';
import { createInitialState } from './engine/engine';
import { decide, inputKindFor } from './engine/personas';
import type { Cmd, RunRecord, SimState, TraceEvent } from './engine/types';

const STORAGE_KEY = 'onboard-trace-v1';
const HISTORY_LIMIT = 50;
const UNDO_LIMIT = 120;

interface Persisted {
  sim: SimState;
  past: SimState[];
  future: SimState[];
  history: RunRecord[];
  explorerWentBack: boolean;
  savedAt: number;
}

export interface Snapshot {
  sim: SimState;
  past: SimState[];
  future: SimState[];
  history: RunRecord[];
  autoPlaying: boolean;
  explorerWentBack: boolean;
  speed: number;
  pendingEffects: number;
}

type Listener = () => void;

function toRunRecord(sim: SimState): RunRecord {
  return {
    runId: sim.runId,
    startedAt: sim.startedAt,
    endedAt: sim.endedAt ?? Date.now(),
    durationMs: (sim.endedAt ?? Date.now()) - sim.startedAt,
    config: sim.config,
    events: sim.events,
    path: sim.path,
    nodes: sim.nodes,
    selectedVersions: sim.selectedVersions,
    ctx: sim.ctx,
  };
}

class Store {
  private sim: SimState;
  private past: SimState[] = [];
  private future: SimState[] = [];
  private history: RunRecord[] = [];
  private autoPlaying = false;
  private explorerWentBack = false;
  private speed = 1;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private listeners = new Set<Listener>();
  private version = 0;
  private snap: Snapshot | null = null;

  constructor() {
    const restored = this.restore();
    this.sim = restored?.sim ?? createInitialState();
    this.past = restored?.past ?? [];
    this.future = restored?.future ?? [];
    this.history = restored?.history ?? [];
    this.explorerWentBack = restored?.explorerWentBack ?? false;
  }

  // ---------- 订阅 ----------
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): Snapshot => {
    if (!this.snap) {
      this.snap = this.buildSnapshot();
    }
    return this.snap;
  };
  private buildSnapshot(): Snapshot {
    return {
      sim: this.sim,
      past: this.past,
      future: this.future,
      history: this.history,
      autoPlaying: this.autoPlaying,
      explorerWentBack: this.explorerWentBack,
      speed: this.speed,
      pendingEffects: this.timers.size,
    };
  }
  private emit() {
    this.version += 1;
    this.snap = this.buildSnapshot();
    this.persist();
    this.listeners.forEach((l) => l());
  }
  get v() {
    return this.version;
  }

  // ---------- 持久化（刷新恢复） ----------
  private restore(): Persisted | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Persisted;
      if (!data.sim || !data.sim.runId) return null;
      // 刷新发生在运行中：按“中断待恢复”处理
      if (data.sim.status === 'running' && data.sim.current) {
        data.sim.status = 'interrupted';
        data.sim.interruptedFrom = data.sim.interruptedFrom ?? data.sim.current;
        const ev: TraceEvent = {
          seq: data.sim.seq,
          at: Date.now() - data.sim.startedAt,
          runId: data.sim.runId,
          type: 'session_recovered',
          stepId: data.sim.current,
          version: data.sim.nodes[data.sim.current]?.version,
          message: '检测到刷新/重开：运行中的会话已标记为中断待恢复，可从当前节点继续',
        };
        data.sim.seq += 1;
        data.sim.events.push(ev);
      }
      return data;
    } catch {
      return null;
    }
  }

  private persist() {
    try {
      const data: Persisted = {
        sim: this.sim,
        past: this.past,
        future: this.future,
        history: this.history,
        explorerWentBack: this.explorerWentBack,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 配额或隐私模式：忽略，内存态仍可用
    }
  }

  clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ---------- 计时副作用 ----------
  private schedule(delayMs: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, Math.max(0, delayMs / this.speed));
    this.timers.add(t);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ---------- 核心派发 ----------
  dispatch(cmd: Cmd, opts?: { undoable?: boolean }) {
    const undoable = opts?.undoable ?? true;
    const before = this.sim;
    const { state: next, effects } = reduce(before, cmd);
    if (next === before && effects.length === 0) return;

    if (undoable && next !== before) {
      this.past.push(before);
      if (this.past.length > UNDO_LIMIT) this.past.shift();
      this.future = [];
    }
    this.sim = next;

    // 完成的运行归档
    if (before.status !== 'completed' && next.status === 'completed') {
      const rec = toRunRecord(next);
      this.history = [rec, ...this.history.filter((h) => h.runId !== rec.runId)].slice(0, HISTORY_LIMIT);
    }
    // 新运行重置拟人状态
    if (cmd.t === 'start') this.explorerWentBack = false;

    this.emit();

    for (const eff of effects) {
      this.schedule(eff.delayMs, () => {
        this.dispatch(eff.cmd, { undoable: true });
        this.maybeAutoStep();
      });
    }
    this.maybeAutoStep();
  }

  // ---------- 撤销 / 重做 ----------
  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.stopAuto();
    this.clearTimers();
    this.future.unshift(this.sim);
    this.sim = prev;
    if (prev.current && prev.nodes[prev.current]?.status === 'loading') {
      const stepId = prev.current;
      this.schedule(1200, () => this.dispatch({ t: 'renderComplete', stepId }));
    }
    this.emit();
  }
  redo() {
    const next = this.future.shift();
    if (!next) return;
    this.stopAuto();
    this.clearTimers();
    this.past.push(this.sim);
    this.sim = next;
    // 撤销时取消的慢加载回调，重做后需要补排，否则节点永久 loading
    if (next.current && next.nodes[next.current]?.status === 'loading') {
      const stepId = next.current;
      this.schedule(1200, () => this.dispatch({ t: 'renderComplete', stepId }));
    }
    this.emit();
  }
  canUndo() {
    return this.past.length > 0;
  }
  canRedo() {
    return this.future.length > 0;
  }

  // ---------- 自动播放 ----------
  startAuto() {
    if (this.autoPlaying) return;
    this.autoPlaying = true;
    this.emit();
    this.maybeAutoStep();
  }
  stopAuto() {
    if (!this.autoPlaying) return;
    this.autoPlaying = false;
    this.emit();
  }
  toggleAuto() {
    if (this.autoPlaying) this.stopAuto();
    else this.startAuto();
  }
  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  /** 单步：执行一次拟人决策（不开启自动播放） */
  singleStep() {
    const sim = this.sim;
    if (sim.status !== 'running' || !sim.current) return;
    const ns = sim.nodes[sim.current];
    if (!ns || ns.status === 'loading') return;
    const meta = { explorerWentBack: this.explorerWentBack };
    const action = decide(sim, meta);
    this.explorerWentBack = meta.explorerWentBack;
    if (!action) return;
    const input = inputKindFor(this.sim.config.device, action.kind, this.sim.seq);
    if (action.kind === 'primary') {
      this.dispatch({ t: 'primary', input, choiceId: action.choiceId, values: action.values });
    } else if (action.kind === 'skip') {
      this.dispatch({ t: 'skip', input });
    } else {
      this.dispatch({ t: 'back', input });
    }
  }

  private maybeAutoStep() {
    if (!this.autoPlaying) return;
    const sim = this.sim;
    if (sim.status !== 'running' || !sim.current) {
      this.autoPlaying = false;
      this.emit();
      return;
    }
    const ns = sim.nodes[sim.current];
    if (!ns || ns.status === 'loading') return; // 渲染完成回调会再次驱动
    const meta = { explorerWentBack: this.explorerWentBack };
    const action = decide(sim, meta);
    this.explorerWentBack = meta.explorerWentBack;
    if (!action) return;
    const delay = 520 + Math.floor(Math.random() * 380);
    this.schedule(delay, () => {
      const input = inputKindFor(this.sim.config.device, action.kind, this.sim.seq);
      if (action.kind === 'primary') {
        this.dispatch({ t: 'primary', input, choiceId: action.choiceId, values: action.values });
      } else if (action.kind === 'skip') {
        this.dispatch({ t: 'skip', input });
      } else {
        this.dispatch({ t: 'back', input });
      }
    });
  }

  // ---------- 杂项 ----------
  resetAll() {
    this.clearTimers();
    this.autoPlaying = false;
    this.explorerWentBack = false;
    this.past = [];
    this.future = [];
    this.sim = createInitialState();
    this.snap = null;
    this.emit();
    // emit() 会持久化一次空状态；再清空，保证刷新后是完全干净的首次状态
    this.clearStorage();
  }

  armFault(kind: SimState['armedFault']) {
    this.dispatch({ t: 'armFault', kind }, { undoable: false });
  }
}

export const store = new Store();
