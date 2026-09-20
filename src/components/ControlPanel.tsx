import type { Dispatch } from 'react'
import type { Action } from '../engine/reducer'
import { faultLabel } from '../engine/reducer'
import type { AppState, FaultKind, InputMethod, UserFlags } from '../engine/types'
import { initialFlags } from '../engine/types'

interface Props {
  state: AppState
  dispatch: Dispatch<Action>
}

const FAULT_KINDS: FaultKind[] = ['network', 'versionDrift', 'doubleSubmit', 'keyboardFocus']

const FAULT_HINT: Record<FaultKind, string> = {
  network: '提交时失败 → 步骤进入“中断待恢复”',
  versionDrift: '运行中第三方改版本，返回/重跑时暴露边界',
  doubleSubmit: '双击/重复回车只生效一次',
  keyboardFocus: '移动端键盘提交送不到控件',
}

export function ControlPanel({ state, dispatch }: Props) {
  const persona = state.personas.find((p) => p.id === state.selectedPersonaId)
  const run = state.run
  const completed = state.completedRuns.find((x) => x.personaId === state.selectedPersonaId)?.count ?? 0

  return (
    <div className="column">
      <section className="panel">
        <div className="panel-head">验收画像</div>
        <div className="panel-body">
          <div className="persona-list">
            {state.personas.map((p) => (
              <button
                key={p.id}
                className={`persona-item ${state.selectedPersonaId === p.id ? 'sel' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_PERSONA', personaId: p.id })}
              >
                <div className="pn">
                  {p.name} <span className="label">{p.device === 'mobile' ? '📱' : '🖥'}</span>
                </div>
                <div className="pd">{p.description}</div>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="primary"
              style={{ flex: 1 }}
              onClick={() => dispatch({ type: 'START', personaId: state.selectedPersonaId })}
            >
              {run ? '↻ 以该画像重新开始' : '▶ 开始运行'}
            </button>
          </div>
          <div className="summary-pills" style={{ marginTop: 8 }}>
            <span className="pill">本画像已完成 <b>{completed}</b> 次</span>
            {run?.repeatOf !== undefined && <span className="pill">本次=重复运行</span>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          输入模拟
          <div className="spacer" />
          <div className="seg">
            {(['mouse', 'keyboard'] as InputMethod[]).map((m) => (
              <button
                key={m}
                className={state.input === m ? 'active' : ''}
                onClick={() => dispatch({ type: 'SET_INPUT', input: m })}
              >
                {m === 'mouse' ? '🖱 鼠标/触摸' : '⌨ 键盘'}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ paddingTop: 8, paddingBottom: 10 }}>
          <div className="label" style={{ lineHeight: 1.7 }}>
            键盘模式下预览区获得焦点后，按 <span className="kbd">Enter</span> / <span className="kbd">Space</span> 等价于点击“继续”。
            <br />
            选择类步骤：鼠标点选项即提交；键盘先用鼠标点选，再用回车继续，或直接点选项。
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">故障注入</div>
        <div className="panel-body">
          <div className="fault-grid">
            {FAULT_KINDS.map((k) => (
              <button
                key={k}
                className={`fault-btn ${state.faults[k] ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_FAULT', kind: k })}
                title={FAULT_HINT[k]}
              >
                {state.faults[k] ? '🟥 ' : '⬜ '}
                {faultLabel(k)}
                <div style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>
                  {FAULT_HINT[k]}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <FlagsInspector state={state} />

      <section className="panel">
        <div className="panel-head">说明</div>
        <div className="panel-body" style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          四种结局的区分方式：
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li><b>未展示</b>：本次路径上不可达（被分支绕开或尚未走到）。</li>
            <li><b>条件不满足</b>：到达了该步骤，但 gate / 版本可见条件求值为 false，自动绕开并记录求值上下文。</li>
            <li><b>主动跳过</b>：步骤已展示，用户点了“跳过”（必要确认被跳过时会额外打风险标记）。</li>
            <li><b>中断待恢复</b>：已展示后因故障中断，现场持久化，可原地恢复。</li>
          </ul>
          {persona && (
            <div style={{ marginTop: 8 }}>
              当前画像初始 flags 与运行中收集值见下方检查器（绿色=本次运行被修改）。
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FlagsInspector({ state }: { state: AppState }) {
  const persona = state.personas.find((p) => p.id === state.selectedPersonaId)
  const live: UserFlags = state.run?.flags ?? persona?.flags ?? initialFlags
  const base: UserFlags = persona?.flags ?? initialFlags

  const rows: { key: keyof UserFlags; label: string }[] = [
    { key: 'accountType', label: '账号类型' },
    { key: 'region', label: '地区' },
    { key: 'ageVerified', label: '已成年' },
    { key: 'privacyAccepted', label: '隐私同意' },
    { key: 'tosAccepted', label: '条款同意' },
    { key: 'cookiesAccepted', label: 'Cookie' },
    { key: 'marketingEmail', label: '营销邮件' },
    { key: 'plan', label: '方案' },
    { key: 'inviteCode', label: '邀请码' },
  ]

  return (
    <section className="panel">
      <div className="panel-head">
        用户画像 / 运行态
        <div className="spacer" />
        <span className="label">{state.run ? `运行 #${state.run.runId}` : '画像初始值'}</span>
      </div>
      <div className="panel-body">
        <div className="flags-grid">
          {rows.map(({ key, label }) => {
            const changed = state.run !== null && String(base[key]) !== String(live[key])
            return (
              <div key={key} className={`flag ${changed ? 'changed' : ''}`} title={label}>
                <span className="k">{key}</span>
                <span className="v">{formatVal(live[key])}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function formatVal(v: unknown): string {
  if (v === null) return 'null'
  if (v === '') return '""'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}
