import { PERSIST_KEY, SCHEMA_VERSION } from './reducer'
import type { AppState } from './types'

/** 整个状态（含撤销/重做栈）都可 JSON 序列化，刷新后完整恢复现场 */
export function saveState(state: AppState): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(state))
  } catch {
    // 存储不可用时静默降级（隐私模式/配额满）
  }
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    if (parsed.persistedSchema !== SCHEMA_VERSION) return null
    // 自动播放属于瞬时态，恢复后一律停止
    parsed.playing = false
    return parsed
  } catch {
    return null
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(PERSIST_KEY)
  } catch {
    // ignore
  }
}
