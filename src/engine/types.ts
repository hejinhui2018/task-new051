// 领域模型：引导步骤的多版本定义、条件分支、运行态追踪结构

export type Scalar = string | number | boolean;
export type Ctx = Record<string, Scalar>;

export type DeviceType = 'desktop' | 'tablet' | 'mobile';
export type Region = 'CN' | 'US' | 'EU';
export type Owner = 'product' | 'design' | 'legal';
/** 用户操作来源：真实鼠标点击 / 键盘 / 自动播放拟人 */
export type InputKind = 'click' | 'keyboard' | 'auto';
export type PersonaId = 'cooperative' | 'skipper' | 'enterprise' | 'explorer';

export type Op = '==' | '!=' | '>=' | '<=' | '>' | '<';

/** 条件表达式 DSL（可序列化，便于在事件里回放“为什么走这条边”） */
export type ConditionExpr =
  | { all: ConditionExpr[] }
  | { any: ConditionExpr[] }
  | { not: ConditionExpr }
  | { field: 'ctx' | 'device' | 'region'; key: string; op: Op; value: Scalar };

export interface ConditionScope {
  ctx: Ctx;
  device: DeviceType;
  region: Region;
}

export type StepKind = 'info' | 'choice' | 'form' | 'consent' | 'complete';

export interface ChoiceDef {
  id: string;
  label: string;
  desc?: string;
  /** 选中即写入的上下文 */
  sets?: Ctx;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'checkbox';
  required?: boolean;
  placeholder?: string;
}

/** 同一个步骤的一个版本：产品 / 设计 / 法务各自发布，带生效条件 */
export interface StepVersion {
  version: string;
  owner: Owner;
  publishedAt: string;
  changelog: string;
  /** 版本命中条件（不写表示基线版本，兜底） */
  when?: ConditionExpr;
  kind: StepKind;
  title: string;
  body: string;
  /** 该版本实现上是否允许跳过；与步骤的业务必要性 required 互相独立 */
  skippable: boolean;
  primaryLabel: string;
  skipLabel?: string;
  choices?: ChoiceDef[];
  fields?: FieldDef[];
  setsOnConfirm?: Ctx;
  setsOnSkip?: Ctx;
}

export interface Edge {
  id: string;
  to: string;
  when?: ConditionExpr;
  label?: string;
}

export interface StepDef {
  id: string;
  /** 业务上的“必要确认”：即使某个版本允许跳过，验收时仍要标红 */
  required: boolean;
  /** 入口可见条件；求值为 false 时记“条件不满足”，自动顺延 */
  visible?: ConditionExpr;
  /** 坐标仅用于流程图渲染 */
  pos: { x: number; y: number };
  versions: StepVersion[];
  edges: Edge[];
}

// ---------- 运行态 ----------

export type RunStatus = 'idle' | 'running' | 'interrupted' | 'completed';

export type NodeStatus =
  | 'unseen' // 未展示：路径从未到达
  | 'loading' // 故障注入：慢加载
  | 'condition_failed' // 条件不满足：到达但入口条件为 false
  | 'shown' // 已展示，待用户操作
  | 'confirmed' // 已确认
  | 'skipped' // 主动跳过
  | 'invalidated'; // 返回修改后被失效化的下游节点

export interface BlockedAttempt {
  seq: number;
  reason: string;
  input: InputKind;
}

export interface NodeState {
  status: NodeStatus;
  /** 本次运行实际命中的版本 */
  version?: string;
  enteredSeq?: number;
  /** 该节点写入过的上下文键，返回时按键回收 */
  setKeys: string[];
  blocked: BlockedAttempt[];
  renders: number;
}

export interface TraceEvent {
  seq: number;
  /** 相对运行开始的毫秒数 */
  at: number;
  runId: string;
  type: string;
  message: string;
  stepId?: string;
  version?: string;
  edgeId?: string;
  input?: InputKind;
  device?: DeviceType;
  data?: Record<string, unknown>;
}

export interface EdgeEval {
  result: boolean;
  seq: number;
  at: number;
}

export type FaultKind = 'action-fail' | 'slow-render' | 'crash';

export interface RunConfig {
  device: DeviceType;
  region: Region;
  personaId: PersonaId;
}

export interface SimState {
  runId: string;
  status: RunStatus;
  config: RunConfig;
  ctx: Ctx;
  current: string | null;
  /** 实际进入过的节点顺序（含条件不满足的节点） */
  path: string[];
  nodes: Record<string, NodeState>;
  events: TraceEvent[];
  /** 每条边历次求值结果：分支为何走/没走，全部留痕 */
  edgeEvals: Record<string, EdgeEval[]>;
  selectedVersions: Record<string, string>;
  armedFault: FaultKind | null;
  seq: number;
  startedAt: number;
  endedAt: number | null;
  interruptedFrom: string | null;
}

/** reducer 返回的副作用（慢加载渲染完成等），由 store 层计时触发 */
export type Cmd =
  | { t: 'start'; config: RunConfig }
  | { t: 'primary'; input: InputKind; choiceId?: string; values?: Ctx }
  | { t: 'skip'; input: InputKind }
  | { t: 'back'; input: InputKind }
  | { t: 'interrupt'; reason: 'manual' | 'fault' }
  | { t: 'resume' }
  | { t: 'rerun'; stepId: string; input: InputKind }
  | { t: 'reset' }
  | { t: 'armFault'; kind: FaultKind | null }
  | { t: 'renderComplete'; stepId: string };

export interface Effect {
  type: 'dispatch';
  delayMs: number;
  cmd: Cmd;
}

export interface ReduceResult {
  state: SimState;
  effects: Effect[];
}

export interface RunRecord {
  runId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  config: RunConfig;
  events: TraceEvent[];
  path: string[];
  nodes: Record<string, NodeState>;
  selectedVersions: Record<string, string>;
  ctx: Ctx;
}
