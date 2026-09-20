import type { Dispatch } from 'react'
import type { Action } from '../engine/reducer'
import type { AppState } from '../engine/types'

interface Props {
  state: AppState
  dispatch: Dispatch<Action>
}

export function Transport({ state, dispatch }: Props) {
  const run = state.run
  const active = Boolean(run && !run.endedAt && !run.interruption && run.currentId)
  const interrupted = Boolean(run?.interruption)

  return (
    <div className="transport">
      <button
        className="primary"
        disabled={!active}
        onClick={() => dispatch({ type: 'AUTOPLAY_STEP' })}
        title="按自动决策推进一个用户动作（选项取首项、确认勾选）"
      >
        ⏭ 单步
      </button>
      {state.playing ? (
        button(() => dispatch({ type: 'SET_PLAYING', playing: false }), '⏸ 暂停', !run || Boolean(run.endedAt))
      ) : (
        <button disabled={!active} onClick={() => dispatch({ type: 'SET_PLAYING', playing: true })}>
          ▶ 自动播放
        </button>
      )}
      <button disabled={!active} onClick={() => dispatch({ type: 'BACK' })} title="返回上一个已完成步骤">
        ← 返回修改
      </button>
      {interrupted && (
        <button
          onClick={() => {
            if (state.faults.network) dispatch({ type: 'TOGGLE_FAULT', kind: 'network' })
            dispatch({ type: 'RESUME' })
          }}
        >
          ⏯ 中断恢复
        </button>
      )}
      <button
        disabled={!run || Boolean(run.endedAt)}
        onClick={() => dispatch({ type: 'RERUN', fromStepId: run?.currentId })}
        title="从当前节点开启新运行"
      >
        ↳ 当前节点重跑
      </button>

      <span style={{ flex: 1 }} />

      <button disabled={state.past.length === 0} onClick={() => dispatch({ type: 'UNDO' })} title="撤销（Ctrl+Z）">
        ↶ 撤销
      </button>
      <button disabled={state.future.length === 0} onClick={() => dispatch({ type: 'REDO' })} title="重做（Ctrl+Shift+Z）">
        ↷ 重做
      </button>
      <button className="danger" disabled={!run && state.trace.length === 0} onClick={() => dispatch({ type: 'RESET' })}>
        ⌫ 重置
      </button>
      <span className="kbid">
        <span className="kbd">→</span> 单步 · <span className="kbd">←</span> 返回 · <span className="kbd">Ctrl Z</span> 撤销
      </span>
    </div>
  )
}

function button(onClick: () => void, label: string, disabled: boolean) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}
