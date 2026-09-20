import { useEffect } from 'react'
import type { Dispatch } from 'react'
import type { Action } from './engine/reducer'
import type { AppState } from './engine/types'
import { useOnboardStore } from './hooks/useOnboardStore'
import { DeviceSim } from './components/DeviceSim'
import { PathMap } from './components/PathMap'
import { TraceLog } from './components/TraceLog'
import { ControlPanel } from './components/ControlPanel'
import { Transport } from './components/Transport'
import { useStepDraft } from './hooks/useStepDraft'

export default function App() {
  const { state, dispatch } = useOnboardStore()
  const [draft, patchDraft] = useStepDraft(state.run)

  useGlobalShortcuts(state, dispatch)

  const interrupted = state.run?.interruption

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="logo">OnboardTrace</span> 引导流程验收台
        </h1>
        <span className="sub">步骤版本 · 条件分支 · 返回修改 · 中断恢复</span>
        <div className="spacer" />
        <span className="hint">
          {state.run
            ? interrupted
              ? `运行 #${state.run.runId} 中断于 ${interrupted.stepId}，待恢复`
              : state.run.endedAt
                ? `运行 #${state.run.runId} 已完成`
                : `运行 #${state.run.runId} 进行中 · 当前 ${state.run.currentId}`
            : '空闲 · 选择画像后开始'}
        </span>
      </header>

      <main className="layout">
        <div className="column scroll-y" style={{ minHeight: 0 }}>
          <ControlPanel state={state} dispatch={dispatch} />
        </div>

        <div className="column" style={{ minHeight: 0 }}>
          <DeviceSim state={state} dispatch={dispatch} draft={draft} patchDraft={patchDraft} />
          <Transport state={state} dispatch={dispatch} />
        </div>

        <div className="column" style={{ minHeight: 0 }}>
          <PathMap state={state} dispatch={dispatch} />
          <TraceLog trace={state.trace} currentRunId={state.run?.runId} />
        </div>
      </main>
    </div>
  )
}

function useGlobalShortcuts(state: AppState, dispatch: Dispatch<Action>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const editing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      const onButton = target?.tagName === 'BUTTON'

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
        return
      }
      if (editing) return

      const run = state.run
      const active = Boolean(run && !run.endedAt && !run.interruption && run.currentId)
      if (e.key === 'ArrowRight' && active) {
        e.preventDefault()
        dispatch({ type: 'AUTOPLAY_STEP' })
      } else if (e.key === 'ArrowLeft' && active) {
        e.preventDefault()
        dispatch({ type: 'BACK' })
      } else if (e.key === ' ' && !onButton) {
        // 空格在预览区/按钮之外切换播放
        if (target?.closest('.step-screen')) return
        e.preventDefault()
        dispatch({ type: 'SET_PLAYING', playing: !state.playing })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, dispatch])
}
