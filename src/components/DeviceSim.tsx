import type { Dispatch } from 'react'
import { selectVersion } from '../engine/reducer'
import type { Action } from '../engine/reducer'
import { END_STEP, STEP_MAP } from '../engine/flow'
import type { AppState, InputMethod, StepVersion } from '../engine/types'
import type { StepDraft } from '../hooks/useStepDraft'

interface Props {
  state: AppState
  dispatch: Dispatch<Action>
  draft: StepDraft
  patchDraft: (d: Partial<StepDraft>) => void
}

export function DeviceSim({ state, dispatch, draft, patchDraft }: Props) {
  const run = state.run
  const isMobile = state.device === 'mobile'

  const startRun = () => dispatch({ type: 'START', personaId: state.selectedPersonaId })

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-head">
        引导预览
        <span className="label">
          {isMobile ? '移动端 390×844（触摸/软键盘）' : '桌面端 1440 视口（鼠标/键盘）'}
        </span>
        <div className="spacer" />
        <div className="seg">
          <button
            className={state.device === 'desktop' ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_DEVICE', device: 'desktop' })}
          >
            🖥 桌面
          </button>
          <button
            className={state.device === 'mobile' ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_DEVICE', device: 'mobile' })}
          >
            📱 移动
          </button>
        </div>
      </div>

      <div className="device-wrap">
        <div className={`device ${isMobile ? 'mobile' : 'desktop'}`}>
          <div className="device-bar">
            <span>{isMobile ? '9:41' : 'Chrome · onboarding.app'}</span>
            <span className="dotline">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="device-screen">
            {!run || !run.currentId ? (
              <IdleScreen onStart={startRun} personaName={state.personas.find((p) => p.id === state.selectedPersonaId)?.name} />
            ) : (
              <StepScreen state={state} dispatch={dispatch} draft={draft} patchDraft={patchDraft} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IdleScreen({ onStart, personaName }: { onStart: () => void; personaName?: string }) {
  return (
    <div className="idle-screen">
      <div className="big">🧭</div>
      <div style={{ fontWeight: 700, color: '#1c2330' }}>OnboardTrace 验收台</div>
      <div style={{ fontSize: 12.5 }}>
        当前画像：<b>{personaName}</b>
        <br />
        选择画像、固定步骤版本或注入故障后开始一次运行。
      </div>
      <button className="primary" onClick={onStart}>
        ▶ 开始引导运行
      </button>
    </div>
  )
}

function StepScreen({ state, dispatch, draft, patchDraft }: Props) {
  const run = state.run!
  const id = run.currentId
  const def = STEP_MAP[id]
  const rt = run.steps[id]
  const ver: StepVersion | null = def
    ? selectVersion(def, { ...run.flags, device: state.device }, state.activeOverrides[id] ?? state.flowVersionOverrides[id])
    : null

  if (!def || !ver || !rt) {
    return <div className="idle-screen">步骤 {id} 无可展示版本（应已自动绕开）</div>
  }

  const isEnd = id === END_STEP
  const progress = Math.max(1, run.enteredOrder.indexOf(id) + 1)
  const totalVisible = run.enteredOrder.length
  const submit = (value?: unknown, input?: InputMethod) => dispatch({ type: 'SUBMIT', value, input })

  const onKeyContinue = (e: React.KeyboardEvent) => {
    // 焦点在具体控件（选项/开关/复选框）上时，Enter/Space 只操作控件本身，
    // 避免“勾选”和“提交”同时触发；用全局 → 键或继续按钮提交。
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const input: InputMethod = 'keyboard'
      if (def.kind === 'choice') submit(draft.choice, input)
      else if (def.kind === 'toggle') submit(draft.toggleOn, input)
      else if (def.kind === 'consent') submit(draft.checked ? true : false, input)
      else submit(undefined, input)
    }
  }

  return (
    <div className="step-screen" tabIndex={0} onKeyDown={onKeyContinue}>
      <div className="step-progressbar">
        {Array.from({ length: Math.max(totalVisible, progress) }).map((_, i) => (
          <i key={i} className={i < progress - 1 || isEnd ? 'done' : ''} />
        ))}
      </div>

      <div className="step-content">
        <div>
          <span className="step-kindtag">{kindLabel(def.kind)}</span>
          <span className={`step-version tag-owner ${ver.owner}`}>{ver.v} · {ownerCN(ver.owner)}</span>
        </div>
        <h2 className="step-title">{ver.title}</h2>
        <p className="step-body">{ver.body}</p>
        <div className="step-owner-note">📝 {ownerCN(ver.owner)}备注：{ver.note}</div>

        {def.kind === 'choice' && (
          <div className="option-list">
            {ver.options?.map((opt) => (
              <button
                key={opt.value}
                className={`option-btn ${draft.choice === opt.value ? 'sel' : ''}`}
                onClick={() => {
                  patchDraft({ choice: opt.value })
                  submit(opt.value, 'mouse')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    patchDraft({ choice: opt.value })
                    submit(opt.value, 'keyboard')
                  }
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {def.kind === 'toggle' && (
          <div className="switch-row">
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {id === 'ageGate' ? '我已年满 18 岁' : '接收营销邮件通知'}
            </span>
            <button
              className={`switch ${draft.toggleOn ? 'on' : ''}`}
              aria-label="toggle"
              onClick={() => patchDraft({ toggleOn: !draft.toggleOn })}
            />
          </div>
        )}

        {def.kind === 'consent' && (
          <label className={`consent-check ${ver.required && !draft.checked ? '' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(draft.checked)}
              onChange={(e) => patchDraft({ checked: e.target.checked })}
            />
            <span>
              我已阅读并同意《{ver.title}》
              {ver.required && <b style={{ color: '#c2410c' }}>（必要确认，不可跳过）</b>}
            </span>
          </label>
        )}

        {def.kind === 'complete' && (
          <div style={{ fontSize: 40, textAlign: 'center', padding: '8px 0' }}>✅</div>
        )}
      </div>

      {run.interruption && run.interruption.stepId === id && (
        <div className="interrupt-banner">
          <b>⚠ 中断待恢复</b>
          <div>{run.interruption.reason}（{new Date(run.interruption.at).toLocaleTimeString()}）</div>
          <div style={{ marginTop: 6, fontSize: 11.5 }}>现场已持久化，刷新页面也会回到这里。</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button
              className="primary tiny"
              onClick={() => dispatch({ type: 'TOGGLE_FAULT', kind: 'network' })}
            >
              撤除网络故障
            </button>
            <button className="tiny" onClick={() => dispatch({ type: 'RESUME' })}>
              恢复并重试
            </button>
          </div>
        </div>
      )}

      {ver.required && def.kind !== 'welcome' && def.kind !== 'complete' && (
        <div className="required-hint">必要确认 · 未完成无法继续（尝试继续会被拦截并记录）</div>
      )}

      <div className="step-actions">
        <button
          disabled={run.enteredOrder.indexOf(id) <= 0}
          onClick={() => dispatch({ type: 'BACK' })}
          title="返回上一个已完成步骤修改"
        >
          ← 返回修改
        </button>
        <div className="grow" />
        {ver.skippable && !isEnd && (
          <button className="ghost" onClick={() => dispatch({ type: 'SKIP' })}>
            跳过
          </button>
        )}
        {!ver.skippable && !isEnd && def.kind !== 'choice' && (
          <button
            className="ghost danger"
            title="该版本不允许跳过，点击会记录“必答拦截”"
            onClick={() => dispatch({ type: 'SKIP' })}
          >
            跳过（必答）
          </button>
        )}
        {def.kind !== 'choice' && !isEnd && (
          <button
            className="primary"
            onClick={() => {
              const input = state.input
              if (def.kind === 'toggle') submit(draft.toggleOn, input)
              else if (def.kind === 'consent') submit(draft.checked ? true : false, input)
              else submit(undefined, input)
            }}
          >
            {def.kind === 'consent' ? '确认并继续' : '继续'}
            {state.input === 'keyboard' && <span className="kbd" style={{ marginLeft: 6 }}>Enter</span>}
          </button>
        )}
        {isEnd && (
          <button className="primary" onClick={() => dispatch({ type: 'START', personaId: state.selectedPersonaId })}>
            再跑一次（重复运行）
          </button>
        )}
      </div>
    </div>
  )
}

function kindLabel(k: string): string {
  switch (k) {
    case 'welcome':
      return '欢迎'
    case 'profile':
      return '资料'
    case 'consent':
      return '法务确认'
    case 'choice':
      return '单选分支'
    case 'toggle':
      return '开关'
    case 'complete':
      return '完成'
    default:
      return k
  }
}

function ownerCN(o: StepVersion['owner']): string {
  return o === 'product' ? '产品' : o === 'design' ? '设计' : '法务'
}
