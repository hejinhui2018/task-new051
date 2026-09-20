import { evalCondition } from './conditions'
import { END_STEP, PERSONAS, START_STEP, STEP_MAP } from './flow'
import type {
  AppState,
  BranchRule,
  DeviceType,
  FaultKind,
  FaultState,
  HistorySnapshot,
  InputMethod,
  Owner,
  RunState,
  StepDef,
  StepRuntime,
  StepVersion,
  TraceEntry,
  TraceType,
  UserFlags,
} from './types'
import { initialFlags, noFaults } from './types'

export const PERSIST_KEY = 'onboard-trace:v1'
export const SCHEMA_VERSION = 1
const HISTORY_LIMIT = 100

// ---------------------------------------------------------------------------
// 动作定义
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'START'; personaId: string }
  | { type: 'SELECT_PERSONA'; personaId: string }
  | { type: 'SUBMIT'; value?: unknown; input?: InputMethod }
  | { type: 'SKIP'; input?: InputMethod }
  | { type: 'BACK' }
  | { type: 'RERUN'; fromStepId?: string }
  | { type: 'RESUME' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' }
  | { type: 'SET_VERSION'; stepId: string; version: string | null }
  | { type: 'TOGGLE_FAULT'; kind: FaultKind }
  | { type: 'SET_DEVICE'; device: DeviceType }
  | { type: 'SET_INPUT'; input: InputMethod }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'AUTOPLAY_STEP' }
  | { type: 'REFRESH_RESTORED' }

// ---------------------------------------------------------------------------
// 初始状态
// ---------------------------------------------------------------------------

export function idleRun(): RunState {
  return {
    runId: 0,
    startedAt: 0,
    currentId: '',
    path: [],
    enteredOrder: [],
    steps: {},
    flags: { ...initialFlags },
  }
}

export function initialState(): AppState {
  return {
    flowVersionOverrides: {},
    activeOverrides: {},
    device: 'desktop',
    input: 'mouse',
    faults: { ...noFaults },
    run: null,
    trace: [],
    traceSeq: 0,
    personas: PERSONAS,
    selectedPersonaId: PERSONAS[0]!.id,
    completedRuns: [],
    playing: false,
    persistedSchema: SCHEMA_VERSION,
    past: [],
    future: [],
  }
}

// AppState 的历史栈字段声明在 types.ts 中

// ---------------------------------------------------------------------------
// 追踪日志
// ---------------------------------------------------------------------------

function log(
  state: AppState,
  type: TraceType,
  message: string,
  extra?: Partial<TraceEntry>,
): AppState {
  const entry: TraceEntry = {
    id: state.traceSeq + 1,
    runId: state.run?.runId ?? 0,
    t: Date.now(),
    type,
    message,
    ...extra,
  }
  return { ...state, trace: [...state.trace, entry], traceSeq: entry.id }
}

function snapshot(s: AppState): HistorySnapshot {
  return {
    run: s.run,
    trace: s.trace,
    traceSeq: s.traceSeq,
    flowVersionOverrides: s.flowVersionOverrides,
    activeOverrides: s.activeOverrides,
    completedRuns: s.completedRuns,
    selectedPersonaId: s.selectedPersonaId,
  }
}

function takeHistory(state: AppState): AppState {
  return {
    ...state,
    past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
  }
}

// ---------------------------------------------------------------------------
// 版本选择 / 步骤进入
// ---------------------------------------------------------------------------

export function selectVersion(
  def: StepDef,
  ctx: UserFlags & { device: DeviceType },
  override: string | undefined,
): StepVersion | null {
  if (override) {
    const pinned = def.versions.find((x) => x.v === override)
    if (pinned) return pinned
  }
  return def.versions.find((ver) => evalCondition(ver.visibleWhen, ctx)) ?? null
}

function ctxFor(run: RunState, device: DeviceType): UserFlags & { device: DeviceType } {
  return { ...run.flags, device }
}

function resolveNextId(def: StepDef, run: RunState, device: DeviceType): string | null {
  if (!def.next) return null
  if (typeof def.next === 'string') return def.next
  const rules: BranchRule[] = def.next
  for (const rule of rules) {
    const ok = evalCondition(rule.when, ctxFor(run, device))
    if (ok) return rule.to
  }
  return null
}

/**
 * 尝试进入目标步骤；gate/版本条件不满足时自动绕开到其 next，
 * 直到找到可展示步骤或终点。返回更新后的 state。
 */
function enterTarget(state: AppState, targetId: string): AppState {
  let s = state
  let id: string | null = targetId
  const visited = new Set<string>()

  while (id) {
    if (visited.has(id)) {
      s = log(s, 'step-gate-fail', `检测到步骤环路于 ${id}，已停止`, { stepId: id })
      return s
    }
    visited.add(id)

    const def = STEP_MAP[id]
    if (!def) {
      s = log(s, 'step-gate-fail', `下一步 ${id} 不存在，流程终止`, { stepId: id })
      return s
    }

    const runtime = s.run!.steps[id]

    // 步骤级 gate
    if (!evalCondition(def.gate, ctxFor(s.run!, s.device))) {
      const rt: StepRuntime = { ...(runtime ?? {}), outcome: 'condition-failed' }
      s = {
        ...s,
        run: {
          ...s.run!,
          currentId: id,
          path: appendUnique(s.run!.path, id),
          steps: { ...s.run!.steps, [id]: rt },
        },
      }
      s = log(s, 'step-gate-fail', `步骤「${id}」条件不满足，自动绕开`, {
        stepId: id,
        detail: { gate: def.gate ?? null, flags: { ...s.run!.flags, device: s.device } },
      })
      id = resolveNextId(def, s.run!, s.device)
      continue
    }

    // 版本选择
    const pinned = s.activeOverrides[id] ?? s.flowVersionOverrides[id]
    const ver = selectVersion(def, ctxFor(s.run!, s.device), pinned)
    if (!ver) {
      const rt2: StepRuntime = { ...(runtime ?? {}), outcome: 'condition-failed' }
      s = {
        ...s,
        run: {
          ...s.run!,
          currentId: id,
          path: appendUnique(s.run!.path, id),
          steps: { ...s.run!.steps, [id]: rt2 },
        },
      }
      s = log(s, 'step-gate-fail', `步骤「${id}」没有任何版本满足可见条件`, {
        stepId: id,
        detail: { versions: def.versions.map((v) => ({ v: v.v, when: v.visibleWhen ?? null })) },
      })
      id = resolveNextId(def, s.run!, s.device)
      continue
    }

    // 真正展示
    const seen = new Set(runtime?.seenVersions ?? [])
    const isVersionBoundaryAfterDrift =
      runtime?.version !== undefined && runtime.version !== ver.v
    const rtEnter: StepRuntime = {
      ...(runtime ?? {}),
      outcome: 'visible',
      version: ver.v,
      enteredAt: Date.now(),
      leftAt: undefined,
      seenVersions: [...seen, ver.v],
    }
    s = {
      ...s,
      run: {
        ...s.run!,
        currentId: id,
        path: appendUnique(s.run!.path, id),
        enteredOrder: appendUnique(s.run!.enteredOrder, id),
        steps: { ...s.run!.steps, [id]: rtEnter },
      },
    }
    s = log(s, 'step-enter', `展示步骤「${id}」`, {
      stepId: id,
      version: ver.v,
      owner: ver.owner,
      detail: {
        title: ver.title,
        skippable: ver.skippable,
        required: ver.required ?? false,
        pinned: Boolean(pinned),
      },
    })
    s = log(s, 'step-version', `生效版本 ${ver.v}（${ownerLabel(ver.owner)}）：${ver.note}`, {
      stepId: id,
      version: ver.v,
      owner: ver.owner,
    })
    if (isVersionBoundaryAfterDrift) {
      s = log(s, 'version-boundary', `版本边界：再次进入「${id}」时版本由 ${runtime!.version} 变为 ${ver.v}`, {
        stepId: id,
        version: ver.v,
        detail: { from: runtime!.version, to: ver.v },
      })
    }
    return s
  }
  return s
}

function appendUnique(arr: string[], x: string): string[] {
  return arr.includes(x) ? arr : [...arr, x]
}

export function ownerLabel(o: Owner): string {
  return o === 'product' ? '产品' : o === 'design' ? '设计' : '法务'
}

// ---------------------------------------------------------------------------
// 分支推进
// ---------------------------------------------------------------------------

function leaveAndAdvance(
  state: AppState,
  outcome: 'done' | 'skipped',
  choice: unknown,
  nextFlags: UserFlags,
  logType: TraceType,
  message: string,
  detail?: Record<string, unknown>,
): AppState {
  let s = state
  const run = s.run!
  const id = run.currentId
  const def = STEP_MAP[id]!
  const ver = selectVersion(def, ctxFor(run, s.device), s.activeOverrides[id] ?? s.flowVersionOverrides[id])!

  const before = run.flags
  const flagDiff = diffFlags(before, nextFlags)

  const rt: StepRuntime = {
    ...run.steps[id],
    outcome,
    leftAt: Date.now(),
    choice,
    version: ver.v,
  }
  s = { ...s, run: { ...run, flags: nextFlags, steps: { ...run.steps, [id]: rt } } }
  s = log(s, logType, message, {
    stepId: id,
    version: ver.v,
    owner: ver.owner,
    detail: { choice, flagDiff, ...detail },
  })

  // 求值并记录分支明细
  if (Array.isArray(def.next)) {
    for (const rule of def.next) {
      const ok = evalCondition(rule.when, ctxFor(s.run!, s.device))
      s = log(s, 'branch-eval', `分支条件 ${rule.when} → ${ok ? '命中' : '未命中'}`, {
        stepId: id,
        detail: { when: rule.when, result: ok, label: rule.label },
      })
    }
  }
  const nextId = resolveNextId(def, s.run!, s.device)
  if (!nextId) {
    s = log(s, 'run-end', '没有匹配的分支规则，流程异常终止', { stepId: id })
    return { ...s, playing: false }
  }

  if (nextId === END_STEP) {
    // 终点也经过 gate 循环（complete 无 gate）
    s = enterTarget(s, nextId)
    const endDef = STEP_MAP[END_STEP]!
    const endVer = selectVersion(endDef, ctxFor(s.run!, s.device), s.activeOverrides[END_STEP] ?? s.flowVersionOverrides[END_STEP])
    s = {
      ...s,
      run: {
        ...s.run!,
        endedAt: Date.now(),
        steps: {
          ...s.run!.steps,
          [END_STEP]: {
            ...s.run!.steps[END_STEP],
            outcome: 'done',
            leftAt: Date.now(),
            version: endVer?.v,
          },
        },
      },
    }
    s = log(s, 'run-end', `运行 #${s.run!.runId} 正常结束`, { stepId: END_STEP })
    s = bumpCompleted(s)
    return { ...s, playing: false }
  }

  return enterTarget(s, nextId)
}

function diffFlags(a: UserFlags, b: UserFlags): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of Object.keys(b) as (keyof UserFlags)[]) {
    if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] }
  }
  return out
}

function bumpCompleted(state: AppState): AppState {
  const personaId = state.selectedPersonaId
  const list = state.completedRuns.map((x) => ({ ...x }))
  const row = list.find((x) => x.personaId === personaId)
  if (row) row.count += 1
  else list.push({ personaId, count: 1 })
  return { ...state, completedRuns: list }
}

// ---------------------------------------------------------------------------
// 提交值映射：控件值 -> flags
// ---------------------------------------------------------------------------

function applyChoice(run: RunState, stepId: string, value: unknown): UserFlags {
  const flags = { ...run.flags }
  if (stepId === 'accountType') flags.accountType = value as UserFlags['accountType']
  else if (stepId === 'cookies') flags.cookiesAccepted = value === 'accept'
  else if (stepId === 'planPick') flags.plan = value as UserFlags['plan']
  return flags
}

// ---------------------------------------------------------------------------
// 自动播放决策
// ---------------------------------------------------------------------------

export type AutoAction = { kind: 'submit'; value?: unknown } | { kind: 'pause' }

export function nextAutoAction(state: AppState): AutoAction {
  const run = state.run
  if (!run || run.endedAt || run.interruption || !run.currentId) return { kind: 'pause' }
  const def = STEP_MAP[run.currentId]
  if (!def) return { kind: 'pause' }
  if (def.kind === 'choice') {
    return { kind: 'submit', value: def.versions[0]?.options?.[0]?.value }
  }
  if (def.kind === 'toggle' && def.field) {
    // 必答开关模拟正常用户会开启；非必答开关维持当前值
    const cur = run.flags[def.field]
    const ver0 = selectVersion(def, ctxFor(run, state.device), state.activeOverrides[run.currentId] ?? state.flowVersionOverrides[run.currentId])
    return { kind: 'submit', value: ver0?.required ? true : Boolean(cur) }
  }
  if (def.kind === 'consent') {
    // 自动播放模拟“正常用户”：勾选确认后继续
    return { kind: 'submit', value: true }
  }
  return { kind: 'submit' }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reducer(prev: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SELECT_PERSONA':
      return { ...prev, selectedPersonaId: action.personaId, playing: false }

    case 'SET_DEVICE': {
      if (action.device === prev.device) return prev
      let s = log(
        { ...prev, device: action.device },
        'device-change',
        `设备切换为 ${action.device === 'mobile' ? '移动端' : '桌面端'}（影响后续 gate）`,
        { detail: { device: action.device } },
      )
      // 若停在可见步骤，重新求值当前步骤版本（设备条件可能改变）
      if (s.run && !s.run.endedAt && !s.run.interruption) {
        const id = s.run.currentId
        const def = STEP_MAP[id]!
        if (def) {
          const ver = selectVersion(def, ctxFor(s.run, s.device), s.activeOverrides[id] ?? s.flowVersionOverrides[id])
          if (!ver) {
            s = log(s, 'step-gate-fail', `设备切换后当前步骤无可展示版本`, { stepId: id })
          } else if (s.run.steps[id]?.version !== ver.v) {
            s = log(s, 'version-boundary', `设备切换导致「${id}」版本变为 ${ver.v}`, {
              stepId: id,
              version: ver.v,
            })
          }
        }
      }
      return s
    }

    case 'SET_INPUT':
      return { ...prev, input: action.input }

    case 'TOGGLE_FAULT': {
      const faults: FaultState = { ...prev.faults, [action.kind]: !prev.faults[action.kind] }
      let s: AppState = { ...prev, faults }
      s = log(
        s,
        'fault-injected',
        `${faultLabel(action.kind)} 故障已${faults[action.kind] ? '注入' : '撤除'}`,
        { detail: { fault: action.kind, active: faults[action.kind] } },
      )
      return s
    }

    case 'SET_PLAYING':
      return { ...prev, playing: action.playing }

    case 'START': {
      const persona = prev.personas.find((p) => p.id === action.personaId) ?? prev.personas[0]!
      let s: AppState = takeHistory({
        ...prev,
        selectedPersonaId: persona.id,
        device: persona.device,
        playing: false,
      })
      const priorCount = s.completedRuns.find((x) => x.personaId === persona.id)?.count ?? 0
      const run: RunState = {
        runId: (s.run?.runId ?? 0) + 1,
        startedAt: Date.now(),
        currentId: '',
        path: [],
        enteredOrder: [],
        steps: {},
        flags: { ...persona.flags },
        repeatOf: priorCount > 0 ? s.run?.runId : undefined,
      }
      s = { ...s, run, activeOverrides: { ...s.flowVersionOverrides } }
      s = log(s, 'run-start', `开始运行 #${run.runId}：${persona.name}`, {
        detail: { persona: persona.id, device: persona.device, flags: run.flags },
      })
      if (priorCount > 0) {
        s = log(s, 'repeat-run', `该画像已完成过 ${priorCount} 次运行，本次为重复运行（#${run.runId}）`, {
          detail: { persona: persona.id, priorCount },
        })
      }
      return enterTarget(s, START_STEP)
    }

    case 'RESET': {
      let s = takeHistory(prev)
      s = {
        ...s,
        run: null,
        trace: [],
        traceSeq: 0,
        activeOverrides: {},
        completedRuns: [],
        playing: false,
      }
      s = log(s, 'reset', '已重置运行与追踪记录（可用撤销恢复）')
      return s
    }

    case 'UNDO': {
      const snap = prev.past[prev.past.length - 1]
      if (!snap) return prev
      let s: AppState = {
        ...prev,
        run: snap.run,
        trace: snap.trace,
        traceSeq: snap.traceSeq,
        flowVersionOverrides: snap.flowVersionOverrides,
        activeOverrides: snap.activeOverrides,
        completedRuns: snap.completedRuns,
        selectedPersonaId: snap.selectedPersonaId,
        past: prev.past.slice(0, -1),
        future: [...prev.future, snapshot(prev)],
        playing: false,
      }
      s = log(s, 'undo', '撤销上一步操作')
      return s
    }

    case 'REDO': {
      const snap = prev.future[prev.future.length - 1]
      if (!snap) return prev
      let s: AppState = {
        ...prev,
        run: snap.run,
        trace: snap.trace,
        traceSeq: snap.traceSeq,
        flowVersionOverrides: snap.flowVersionOverrides,
        activeOverrides: snap.activeOverrides,
        completedRuns: snap.completedRuns,
        selectedPersonaId: snap.selectedPersonaId,
        past: [...prev.past, snapshot(prev)],
        future: prev.future.slice(0, -1),
      }
      s = log(s, 'redo', '重做被撤销的操作')
      return s
    }

    case 'SET_VERSION': {
      let s = takeHistory(prev)
      const cur = s.flowVersionOverrides[action.stepId]
      const next: Record<string, string> = { ...s.flowVersionOverrides }
      if (action.version === null || cur === action.version) delete next[action.stepId]
      else next[action.stepId] = action.version
      s = { ...s, flowVersionOverrides: next }
      const def = STEP_MAP[action.stepId]!
      const ver = action.version ? def.versions.find((v) => v.v === action.version!) : undefined
      s = log(
        s,
        'version-boundary',
        action.version
          ? `固定「${action.stepId}」使用 ${action.version}（${ver ? ownerLabel(ver.owner) : '?'}）`
          : `取消「${action.stepId}」的版本固定`,
        { stepId: action.stepId, version: action.version ?? undefined },
      )
      // 运行中改一个已经看过的步骤 = 第三方（产品/设计/法务）在验收期间改版
      const rt = s.run?.steps[action.stepId]
      if (s.run && rt && action.version && rt.version !== action.version) {
        s = log(
          s,
          s.faults.versionDrift ? 'fault-injected' : 'version-boundary',
          s.faults.versionDrift
            ? `版本漂移故障：运行中「${action.stepId}」被第三方从 ${rt.version} 改为 ${action.version}，重跑该节点才生效`
            : `运行中修改已展示步骤版本：从 ${rt.version} → ${action.version}（返回/重跑时生效）`,
          {
            stepId: action.stepId,
            version: action.version,
            detail: { from: rt.version, to: action.version, drift: s.faults.versionDrift },
          },
        )
      }
      return s
    }

    case 'BACK': {
      const run = prev.run
      if (!run || !run.currentId || run.interruption || run.endedAt) return prev
      const order = run.enteredOrder
      const idx = order.lastIndexOf(run.currentId)
      const targetIdx = (() => {
        for (let i = idx - 1; i >= 0; i--) {
          const o = run.steps[order[i]!]?.outcome
          if (o === 'done' || o === 'skipped') return i
        }
        return -1
      })()
      if (targetIdx < 0) return prev
      const targetId = order[targetIdx]!
      const dropped = order.slice(targetIdx + 1)
      let s = takeHistory(prev)
      const keptSteps = { ...s.run!.steps }
      for (const d of dropped) delete keptSteps[d]
      s = {
        ...s,
        run: {
          ...s.run!,
          enteredOrder: order.slice(0, targetIdx + 1),
          path: s.run!.path.filter((p) => !dropped.includes(p)),
          steps: keptSteps,
        },
      }
      s = log(s, 'step-back', `返回「${targetId}」修改，其后的 ${dropped.length} 个步骤标记为未展示`, {
        stepId: targetId,
        detail: { from: run.currentId, dropped },
      })
      return enterTarget(s, targetId)
    }

    case 'SKIP': {
      const run = prev.run
      if (!run || !run.currentId || run.endedAt || run.interruption) return prev
      const id = run.currentId
      const def = STEP_MAP[id]!
      const ver = selectVersion(def, ctxFor(run, prev.device), prev.activeOverrides[id] ?? prev.flowVersionOverrides[id])
      if (!ver) return prev
      let s = log(prev, 'input-detail', `用户以${(action.input ?? prev.input) === 'keyboard' ? '键盘' : '鼠标'}触发“跳过”`, {
        stepId: id,
        detail: { input: action.input ?? prev.input },
      })
      if (!ver.skippable) {
        s = takeHistory(s)
        s = log(
          s,
          'step-required-block',
          `「${id}」${ver.v} 不允许跳过：必答确认被拦截`,
          { stepId: id, version: ver.v, owner: ver.owner, detail: { required: true } },
        )
        return { ...s, playing: false }
      }
      s = takeHistory(s)
      return leaveAndAdvance(
        s,
        'skipped',
        { skipped: true, input: action.input ?? s.input },
        run.flags,
        'step-skip',
        ver.required
          ? `主动跳过必要确认「${id}」（${ver.v} 标记 required，但该版本允许跳过 —— 验收风险点）`
          : `主动跳过「${id}」`,
        { required: ver.required ?? false, skippable: true },
      )
    }

    case 'SUBMIT':
    case 'AUTOPLAY_STEP': {
      const run = prev.run
      if (!run || !run.currentId || run.endedAt || run.interruption) return prev
      const id = run.currentId
      const def = STEP_MAP[id]!
      const ver = selectVersion(def, ctxFor(run, prev.device), prev.activeOverrides[id] ?? prev.flowVersionOverrides[id])
      if (!ver) return prev
      const input: InputMethod = action.type === 'AUTOPLAY_STEP' ? 'mouse' : (action.input ?? prev.input)

      // 自动播放时由策略决定提交值；无法决策（如中断）则停下
      let value: unknown
      if (action.type === 'AUTOPLAY_STEP') {
        const auto = nextAutoAction(prev)
        if (auto.kind === 'pause') return { ...prev, playing: false }
        value = auto.value
      } else {
        value = action.value
      }

      let s = log(prev, 'input-detail', `用户以${input === 'keyboard' ? '键盘（Enter / 空格）' : '鼠标点击'}提交`, {
        stepId: id,
        version: ver.v,
        detail: { input, device: prev.device },
      })

      // 故障：移动端 + 键盘焦点丢失，键盘提交送不到控件
      if (s.faults.keyboardFocus && s.device === 'mobile' && input === 'keyboard') {
        s = log(s, 'fault-injected', '键盘焦点丢失：软键盘弹起导致焦点漂移，本次键盘提交未触达控件（请改用鼠标/触摸）', {
          stepId: id,
          detail: { fault: 'keyboard-focus' },
        })
        return { ...s, playing: false }
      }

      // 故障：网络失败 → 中断待恢复
      if (s.faults.network) {
        s = takeHistory(s)
        const interruption = { stepId: id, kind: 'network' as FaultKind, at: Date.now(), reason: '提交时网络请求失败' }
        s = {
          ...s,
          playing: false,
          run: {
            ...s.run!,
            interruption,
            steps: { ...s.run!.steps, [id]: { ...s.run!.steps[id]!, outcome: 'interrupted' } },
          },
        }
        s = log(s, 'fault-injected', '网络故障注入：提交失败', { stepId: id, detail: { fault: 'network' } })
        s = log(s, 'interrupted', `流程在「${id}」中断，待恢复（刷新页面也可恢复）`, {
          stepId: id,
          detail: interruption,
        })
        return s
      }

      // 计算提交值对 flags 的影响
      let nextFlags = { ...run.flags }
      if (def.kind === 'choice') {
        if (value === undefined) value = ver.options?.[0]?.value
        nextFlags = applyChoice(run, id, value)
      } else if (def.kind === 'toggle') {
        const field = def.field
        const cur = field ? Boolean(run.flags[field]) : false
        const on = typeof value === 'boolean' ? value : !cur
        // 必答开关（如年龄确认 v1）：未开启不能继续；可跳过版本可显式跳过
        if (ver.required && !on) {
          s = takeHistory(s)
          s = log(s, 'step-required-block', `必要开关「${id}」未开启，继续被拦截（${ver.v}）`, {
            stepId: id,
            version: ver.v,
            owner: ver.owner,
            detail: { required: true, on: false },
          })
          return { ...s, playing: false }
        }
        nextFlags = { ...nextFlags, [field ?? '']: on }
      } else if (def.kind === 'consent') {
        const checked = Boolean(value)
        // 必答法务确认：未勾选就继续 → 拦截并记录
        if (ver.required && !checked) {
          s = takeHistory(s)
          s = log(s, 'step-required-block', `必要确认「${id}」未勾选，继续被拦截（${ver.v}，${ownerLabel(ver.owner)}）`, {
            stepId: id,
            version: ver.v,
            owner: ver.owner,
            detail: { required: true, checked: false },
          })
          return { ...s, playing: false }
        }
        // 勾选才写入同意；可跳过版本未勾选继续时，同意标志保持 false（验收可见）
        if (checked && ver.sets) {
          for (const [k] of Object.entries(ver.sets)) {
            ;(nextFlags as Record<string, unknown>)[k] = true
          }
        }
      }
      if (ver.sets) Object.assign(nextFlags, ver.sets)

      // 故障：双击/重复回车 —— 记录重复事件，幂等只提交一次
      s = takeHistory(s)
      if (s.faults.doubleSubmit) {
        s = log(s, 'fault-injected', '检测到双击/重复回车：第二次提交事件被幂等去重拦截', {
          stepId: id,
          detail: { fault: 'double-submit', suppressed: true },
        })
      }

      return leaveAndAdvance(
        s,
        'done',
        { value, input },
        nextFlags,
        'step-submit',
        `提交「${id}」：${renderChoice(id, value)}`,
      )
    }

    case 'RESUME': {
      const run = prev.run
      if (!run?.interruption) return prev
      let s = takeHistory(prev)
      const info = run.interruption
      s = log(s, 'resumed', `从「${info.stepId}」恢复中断（${info.reason}）`, {
        stepId: info.stepId,
        detail: { fault: info.kind, interruptedAt: info.at, resumedAt: Date.now() },
      })
      s = {
        ...s,
        run: {
          ...s.run!,
          interruption: undefined,
          steps: { ...s.run!.steps, [info.stepId]: { ...s.run!.steps[info.stepId]!, outcome: 'visible' } },
        },
      }
      return s
    }

    case 'RERUN': {
      const run = prev.run
      if (!run) return prev
      let s = takeHistory(prev)
      const node = action.fromStepId ?? START_STEP
      const kept: Record<string, StepRuntime> = {}
      const cutIndex = run.enteredOrder.indexOf(node)
      if (cutIndex > 0) {
        for (const sid of run.enteredOrder.slice(0, cutIndex)) {
          if (run.steps[sid]) kept[sid] = run.steps[sid]!
        }
      }
      const newRun: RunState = {
        runId: run.runId + 1,
        startedAt: Date.now(),
        currentId: '',
        path: cutIndex > 0 ? run.enteredOrder.slice(0, cutIndex) : [],
        enteredOrder: cutIndex > 0 ? run.enteredOrder.slice(0, cutIndex) : [],
        steps: kept,
        flags: { ...run.flags },
      }
      s = { ...s, run: newRun, activeOverrides: { ...s.flowVersionOverrides }, playing: false }
      s = log(s, 'rerun-from-node', `从节点「${node}」重跑（新运行 #${newRun.runId}，保留之前画像与前段状态）`, {
        stepId: node,
        detail: { prevRunId: run.runId, keptSteps: Object.keys(kept) },
      })
      return enterTarget(s, node)
    }

    case 'REFRESH_RESTORED': {
      if (!prev.run) return prev
      let s = log(prev, 'refresh-restore', '页面刷新：已从本地存储恢复运行现场（含中断状态）', {
        detail: { runId: prev.run.runId, interrupted: Boolean(prev.run.interruption) },
      })
      return { ...s, playing: false }
    }

    default:
      return prev
  }
}

function renderChoice(stepId: string, value: unknown): string {
  if (value === undefined) return '继续'
  if (stepId === 'cookies') return value === 'accept' ? '全部接受' : '全部拒绝（有效提交，非跳过）'
  if (stepId === 'accountType') return value === 'business' ? '企业账号' : '个人账号'
  if (stepId === 'planPick') return value === 'pro' ? 'Pro 版' : '免费版'
  if (typeof value === 'boolean') return value ? '开' : '关'
  return String(value)
}

export function faultLabel(k: FaultKind): string {
  switch (k) {
    case 'network':
      return '网络失败/中断'
    case 'versionDrift':
      return '运行中版本漂移'
    case 'doubleSubmit':
      return '双击重复提交'
    case 'keyboardFocus':
      return '键盘焦点丢失'
  }
}

/** 供路径图派生每个步骤的最终结局（未经过 = not-shown） */
export function deriveOutcome(state: AppState, stepId: string): StepRuntime | undefined {
  return state.run?.steps[stepId]
}
