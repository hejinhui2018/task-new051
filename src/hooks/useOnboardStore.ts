import { useEffect, useReducer, useRef } from 'react'
import { initialState, reducer } from '../engine/reducer'
import { loadState, saveState } from '../engine/persistence'

export function useOnboardStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState())
  const restoredWithRun = useRef(false)

  // 持久化：每次状态变化写入 localStorage（刷新恢复）
  useEffect(() => {
    saveState(state)
  }, [state])

  // 挂载时若恢复出未完成运行，记录一条 refresh-restore 追踪
  useEffect(() => {
    const restored = loadState()
    if (restored?.run && !restoredWithRun.current) {
      restoredWithRun.current = true
      dispatch({ type: 'REFRESH_RESTORED' })
    }
  }, [])

  // 自动播放：固定节拍派发 AUTOPLAY_STEP
  useEffect(() => {
    if (!state.playing) return
    const timer = window.setInterval(() => {
      dispatch({ type: 'AUTOPLAY_STEP' })
    }, 1100)
    return () => window.clearInterval(timer)
  }, [state.playing])

  return { state, dispatch }
}
