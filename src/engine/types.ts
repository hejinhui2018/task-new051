// OnboardTrace 核心类型：步骤版本 / 条件分支 / 追踪事件

/** 步骤负责人（产品、设计、法务会分别调整同一组步骤） */
export type Owner = 'product' | 'design' | 'legal'

export type DeviceType = 'desktop' | 'mobile'

export type InputMethod = 'mouse' | 'keyboard'

/** 步骤种类 */
export type StepKind =
  | 'welcome'
  | 'profile'
  | 'consent' // 法务确认，必答
  | 'choice' // 单选分支
  | 'toggle' // 开关设置
  | 'complete'

/** 步骤的一个版本：owner 各自维护同一逻辑步骤的不同版本 */
export interface StepVersion {
  /** 版本号，例如 'v1' / 'v2' */
  v: string
  owner: Owner
  note: string
  /** 仅该版本生效的展示条件（在步骤 gate 之外）；缺省视为无条件 */
  visibleWhen?: string
  /** 是否允许主动跳过（法务确认通常为 false） */
  skippable: boolean
  /** 版本内文案/控件配置 */
  title: string
  body: string
  /** choice 步骤的选项 */
  options?: { value: string; label: string }[]
  /** 选项/提交后写入用户画像的字段；consent 写入 requiredConsents */
  sets?: Partial<UserFlags>
  /** 该版本是否强制必答（与 skippable=false 配合，记录“必答未确认”） */
  required?: boolean
}

export interface StepDef {
  id: string
  kind: StepKind
  /** key 为版本号，按 versions 数组顺序取第一个 visibleWhen 通过的 */
  /** toggle 步骤的默认值与字段名（步骤级，所有版本共用） */
  field?: keyof UserFlags
  versions: StepVersion[]
  /** 步骤级展示条件（所有版本共用），缺省总是可达 */
  gate?: string
  /** 下一步：固定 id，或按表达式选择的分支表 */
  next?: string | BranchRule[]
}

export interface BranchRule {
  /** 命中条件（表达式） */
  when: string
  /** 命中后去往的步骤 id */
  to: string
  /** 分支说明，写进追踪日志 */
  label: string
}

/** 用户画像 / 运行期收集的标志位（条件表达式的数据源） */
export interface UserFlags {
  accountType: 'personal' | 'business'
  region: 'cn' | 'eu' | 'us'
  ageVerified: boolean
  marketingEmail: boolean
  privacyAccepted: boolean
  tosAccepted: boolean
  cookiesAccepted: boolean | null
  plan: 'free' | 'pro'
  inviteCode: string
}

export const initialFlags: UserFlags = {
  accountType: 'personal',
  region: 'cn',
  ageVerified: false,
  marketingEmail: false,
  privacyAccepted: false,
  tosAccepted: false,
  cookiesAccepted: null,
  plan: 'free',
  inviteCode: '',
}

/** 条件求值上下文：用户画像 + 当前设备（gate 中可写 device == "mobile"） */
export type EvalCtx = UserFlags & { device: DeviceType }

/** 步骤在一次运行中的四种结局 */
export type StepOutcome =
  | 'visible' // 已展示且仍在进行
  | 'done' // 已完成
  | 'skipped' // 主动跳过（可见时点 Skip）
  | 'condition-failed' // 图上可达，但 gate / 版本可见条件不满足
  | 'not-shown' // 本次路径不可达（尚未经过/被分支绕开）
  | 'interrupted' // 已展示但因故障中断，待恢复

export type TraceType =
  | 'run-start' // 一次运行开始
  | 'run-end' // 正常走到终点
  | 'step-enter' // 步骤进入并展示
  | 'step-gate-fail' // 到达步骤但条件不满足
  | 'step-version' // 实际生效的版本（含 owner）
  | 'step-skip' // 主动跳过
  | 'step-required-block' // 必答步骤尝试跳过/前进被拦
  | 'step-submit' // 用户提交（记录选择）
  | 'step-back' // 返回上一步修改
  | 'branch-taken' // 分支命中
  | 'branch-eval' // 分支求值明细
  | 'version-boundary' // 在某步骤切换了版本
  | 'rerun-from-node' // 从节点重跑
  | 'fault-injected' // 故障注入
  | 'interrupted' // 中断挂起
  | 'resumed' // 中断恢复
  | 'repeat-run' // 重复运行（同画像再来一次）
  | 'reset' // 重置
  | 'undo'
  | 'redo'
  | 'refresh-restore' // 刷新后从 localStorage 恢复
  | 'device-change'
  | 'input-detail' // 键盘/鼠标等输入细节

export interface TraceEntry {
  id: number
  runId: number
  t: number // epoch ms
  type: TraceType
  stepId?: string
  version?: string
  owner?: Owner
  message: string
  detail?: Record<string, unknown>
}

/** 可注入的故障类型 */
export type FaultKind =
  | 'network' // 提交时网络失败：步骤进入 interrupted
  | 'versionDrift' // 运行中步骤版本被第三方改掉
  | 'doubleSubmit' // 双击/重复回车触发重复提交
  | 'keyboardFocus' // 键盘焦点丢失（移动端软键盘场景模拟）

export interface FaultState {
  network: boolean
  versionDrift: boolean
  doubleSubmit: boolean
  keyboardFocus: boolean
}

export const noFaults: FaultState = {
  network: false,
  versionDrift: false,
  doubleSubmit: false,
  keyboardFocus: false,
}

export interface Persona {
  id: string
  name: string
  description: string
  device: DeviceType
  flags: UserFlags
}

/** 一次运行内的步骤状态 */
export interface StepRuntime {
  outcome: StepOutcome
  version?: string
  /** 进入/展示时间戳 */
  enteredAt?: number
  /** 完成或跳过时间戳 */
  leftAt?: number
  /** 该步骤上记录的用户选择（用于日志与重跑） */
  choice?: unknown
  /** 曾经展示过的版本（版本边界用） */
  seenVersions?: string[]
}

export interface RunState {
  runId: number
  startedAt: number
  endedAt?: number
  /** 当前步骤 id；中断时停在故障步骤 */
  currentId: string
  /** 访问路径（所有触达过的步骤 id，含条件失败尝试） */
  path: string[]
  /** 实际“进入并展示”过的步骤顺序（用于返回修改与从节点重跑） */
  enteredOrder: string[]
  steps: Record<string, StepRuntime>
  flags: UserFlags
  /** 中断信息 */
  interruption?: { stepId: string; kind: FaultKind; at: number; reason: string }
  /** 该运行是否为“重复运行”（基于同一画像再次启动） */
  repeatOf?: number
}

/** 撤销/重做快照（仅历史栈使用） */
export interface HistorySnapshot {
  run: RunState | null
  trace: TraceEntry[]
  traceSeq: number
  flowVersionOverrides: Record<string, string>
  activeOverrides: Record<string, string>
  completedRuns: { personaId: string; count: number }[]
  selectedPersonaId: string
}

export interface AppState {
  flowVersionOverrides: Record<string, string> // stepId -> 强制版本号
  activeOverrides: Record<string, string> // 本次运行已应用的覆盖（rerun/reset 前冻结，用于边界检测）
  device: DeviceType
  input: InputMethod
  faults: FaultState
  run: RunState | null
  trace: TraceEntry[]
  traceSeq: number
  personas: Persona[]
  selectedPersonaId: string
  /** 已完成运行的计数（用于“重复运行”判定） */
  completedRuns: { personaId: string; count: number }[]
  /** 自动播放 */
  playing: boolean
  /** 持久化版本号，结构升级时丢弃旧缓存 */
  persistedSchema: number
  past: HistorySnapshot[]
  future: HistorySnapshot[]
}
