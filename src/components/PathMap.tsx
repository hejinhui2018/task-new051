import type { Dispatch } from 'react'
import type { Action } from '../engine/reducer'
import { ownerLabel } from '../engine/reducer'
import { STEPS } from '../engine/flow'
import type { AppState, StepOutcome } from '../engine/types'

interface Props {
  state: AppState
  dispatch: Dispatch<Action>
}

const OUTCOME_TEXT: Record<StepOutcome, string> = {
  visible: '进行中',
  done: '已完成',
  skipped: '主动跳过',
  'condition-failed': '条件不满足',
  'not-shown': '未展示',
  interrupted: '中断待恢复',
}

export function PathMap({ state, dispatch }: Props) {
  const run = state.run

  const counts: Record<StepOutcome, number> = {
    visible: 0,
    done: 0,
    skipped: 0,
    'condition-failed': 0,
    'not-shown': 0,
    interrupted: 0,
  }
  for (const def of STEPS) {
    counts[outcomeOf(state, def.id)]++
  }

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-head">
        路径地图
        <span className="label">{run ? `运行 #${run.runId}` : '尚无运行'}</span>
        <div className="spacer" />
        {run && (
          <button className="tiny" onClick={() => dispatch({ type: 'RERUN' })} title="从 welcome 重新开始一次新运行，保留画像">
            ↻ 全部重跑
          </button>
        )}
      </div>
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <div className="path-legend">
          {(Object.keys(OUTCOME_TEXT) as StepOutcome[]).map((o) => (
            <span className="legend-item" key={o}>
              <i className={`dot ${o}`} /> {OUTCOME_TEXT[o]} {counts[o]! > 0 && <b>{counts[o]}</b>}
            </span>
          ))}
        </div>
      </div>
      <div className="panel-body flex" style={{ paddingTop: 4 }}>
        {STEPS.map((def) => {
          const outcome = outcomeOf(state, def.id)
          const rt = run?.steps[def.id]
          const current = run?.currentId === def.id && outcome === 'visible'
          return (
            <div key={def.id} className={`path-row ${current ? 'current' : outcome}`}>
              <span style={{ paddingTop: 3 }}>
                <i className={`dot ${outcome}`} />
              </span>
              <div className="path-main">
                <div className="path-title">
                  {stepCN(def.id)}
                  <span className="label" style={{ fontFamily: 'var(--mono)', fontWeight: 400 }}>
                    {def.id}
                  </span>
                </div>
                <div className="path-meta">
                  {def.gate && (
                    <>
                      gate <span className="path-gate">{def.gate}</span>
                    </>
                  )}
                  {!def.gate && <span>无 gate</span>}
                  {def.next && Array.isArray(def.next) && (
                    <span> · {def.next.length} 条分支</span>
                  )}
                </div>
                <div className="vchips">
                  {def.versions.map((v) => {
                    const live = rt?.version === v.v && (outcome === 'visible' || outcome === 'done' || outcome === 'skipped' || outcome === 'interrupted')
                    const pinned = state.flowVersionOverrides[def.id] === v.v
                    return (
                      <span
                        key={v.v}
                        className={`vchip ${live ? `live ${v.owner}` : ''} ${pinned ? 'pinned' : ''}`}
                        title={`${ownerLabel(v.owner)} · ${v.note}${v.visibleWhen ? ` · 仅当 ${v.visibleWhen}` : ''}`}
                      >
                        {v.v}
                        {v.owner === 'product' ? ' 产' : v.owner === 'design' ? ' 设' : ' 法'}
                        {pinned ? ' 📌' : ''}
                      </span>
                    )
                  })}
                </div>
                <div className="vpin">
                  <select
                    value={state.flowVersionOverrides[def.id] ?? ''}
                    onChange={(e) =>
                      dispatch({ type: 'SET_VERSION', stepId: def.id, version: e.target.value || null })
                    }
                    title="固定该步骤使用的版本（模拟产品/设计/法务改版后的验收边界）"
                  >
                    <option value="">版本：自动选择</option>
                    {def.versions.map((v) => (
                      <option key={v.v} value={v.v}>
                        固定 {v.v}（{ownerLabel(v.owner)}）
                      </option>
                    ))}
                  </select>
                  {rt?.seenVersions && rt.seenVersions.length > 1 && (
                    <span className="label">
                      本次已见版本：{rt.seenVersions.join(' → ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="path-actions">
                <span className={`outcome-badge ${outcome}`}>{OUTCOME_TEXT[outcome]}</span>
                {run && (outcome === 'done' || outcome === 'skipped' || outcome === 'visible' || outcome === 'interrupted') && (
                  <button
                    className="tiny"
                    onClick={() => dispatch({ type: 'RERUN', fromStepId: def.id })}
                    title="从该节点开启新运行，其后的步骤状态清空重走"
                  >
                    ↳ 从这重跑
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function outcomeOf(state: AppState, stepId: string): StepOutcome {
  const rt = state.run?.steps[stepId]
  if (!rt) return 'not-shown'
  return rt.outcome
}

function stepCN(id: string): string {
  const map: Record<string, string> = {
    welcome: '欢迎页',
    accountType: '账号类型',
    businessVerify: '企业核验',
    ageGate: '年龄确认',
    privacy: '隐私政策',
    tos: '服务条款',
    cookies: 'Cookie 偏好',
    notifications: '通知营销',
    planPick: '方案选择',
    complete: '完成页',
  }
  return map[id] ?? id
}
