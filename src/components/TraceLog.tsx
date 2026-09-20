import { useEffect, useMemo, useRef, useState } from 'react'
import type { TraceType } from '../engine/types'

interface Props {
  trace: import('../engine/types').TraceEntry[]
  currentRunId: number | undefined
}

type FilterKey = 'all' | 'show' | 'choice' | 'branch' | 'version' | 'fault' | 'system'

const FILTERS: { key: FilterKey; label: string; types: TraceType[] }[] = [
  { key: 'all', label: '全部', types: [] },
  {
    key: 'show',
    label: '展示/条件',
    types: ['step-enter', 'step-version', 'step-gate-fail'],
  },
  {
    key: 'choice',
    label: '选择/拦截',
    types: ['step-submit', 'step-skip', 'step-required-block', 'step-back'],
  },
  { key: 'branch', label: '分支', types: ['branch-taken', 'branch-eval'] },
  {
    key: 'version',
    label: '版本边界',
    types: ['version-boundary', 'rerun-from-node'],
  },
  {
    key: 'fault',
    label: '故障/中断',
    types: ['fault-injected', 'interrupted', 'resumed'],
  },
  {
    key: 'system',
    label: '运行/系统',
    types: [
      'run-start',
      'run-end',
      'repeat-run',
      'reset',
      'undo',
      'redo',
      'refresh-restore',
      'device-change',
      'input-detail',
    ],
  },
]

const SEVERITY: Partial<Record<TraceType, 'good' | 'warn' | 'error' | 'info'>> = {
  'step-enter': 'good',
  'step-version': 'info',
  'step-gate-fail': 'info',
  'step-submit': 'good',
  'step-skip': 'warn',
  'step-required-block': 'warn',
  'step-back': 'info',
  'branch-taken': 'info',
  'version-boundary': 'warn',
  'fault-injected': 'error',
  interrupted: 'error',
  resumed: 'good',
  'run-start': 'good',
  'run-end': 'good',
  'repeat-run': 'info',
  reset: 'warn',
  undo: 'info',
  redo: 'info',
  'refresh-restore': 'good',
  'device-change': 'info',
}

const ICON: Partial<Record<TraceType, string>> = {
  'run-start': '▶',
  'run-end': '■',
  'repeat-run': '↻',
  'step-enter': '👁',
  'step-version': '🏷',
  'step-gate-fail': '⛔',
  'step-submit': '✓',
  'step-skip': '⤼',
  'step-required-block': '🔒',
  'step-back': '↩',
  'branch-taken': '⑂',
  'branch-eval': '?',
  'version-boundary': '⇄',
  'rerun-from-node': '↳',
  'fault-injected': '💥',
  interrupted: '⏸',
  resumed: '▶',
  reset: '⌫',
  undo: '↶',
  redo: '↷',
  'refresh-restore': '↻',
  'device-change': '📱',
  'input-detail': '⌨',
}

export function TraceLog({ trace, currentRunId }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [onlyRun, setOnlyRun] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const activeTypes = useMemo(() => FILTERS.find((f) => f.key === filter)?.types ?? [], [filter])

  const shown = trace.filter((e) => {
    if (onlyRun && currentRunId !== undefined && e.runId !== currentRunId) return false
    if (filter === 'all') return true
    return activeTypes.includes(e.type)
  })

  return (
    <div className="panel" style={{ flex: 1, minHeight: 220 }}>
      <div className="panel-head">
        追踪日志
        <span className="label">{shown.length}/{trace.length} 条</span>
        <div className="spacer" />
        <label className="label" style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyRun} onChange={(e) => setOnlyRun(e.target.checked)} />
          仅当前运行
        </label>
        <label className="label" style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          自动滚动
        </label>
      </div>
      <div style={{ padding: '8px 12px 0' }}>
        <div className="trace-filters">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'active tiny' : 'tiny'} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <TraceList entries={shown} autoScroll={autoScroll} />
    </div>
  )
}

function TraceList({ entries, autoScroll }: { entries: Props['trace']; autoScroll: boolean }) {
  const ref = useScrollBottom(entries.length, autoScroll)
  if (entries.length === 0) {
    return (
      <div className="panel-body flex" style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>
        暂无日志。开始一次运行后，这里会按时间记录触发条件、可见步骤、用户选择与后续影响。
      </div>
    )
  }
  return (
    <div className="panel-body flex trace-list" ref={ref}>
      {entries.map((e) => {
        const sev = SEVERITY[e.type]
        const d = new Date(e.t)
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
        return (
          <div key={e.id} className={`trace-entry ${sev ? `sev-${sev}` : ''}`}>
            <span className="trace-time">{time}</span>
            <span className="trace-run">#{e.runId}</span>
            <span className="trace-ico">{ICON[e.type] ?? '·'}</span>
            <span className="trace-msg">
              {e.message}
              {e.stepId && <span className="label" style={{ fontFamily: 'var(--mono)', marginLeft: 6 }}>{e.stepId}</span>}
            </span>
            {e.detail && (
              <pre className="trace-detail">{compactDetail(e.detail)}</pre>
            )}
          </div>
        )
      })}
    </div>
  )
}

function useScrollBottom(dep: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || !ref.current) return
    ref.current.scrollTop = ref.current.scrollHeight
  }, [dep, enabled])
  return ref
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function compactDetail(detail: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detail)) {
    if (k === 'flags' && v && typeof v === 'object') {
      cleaned[k] = v
    } else {
      cleaned[k] = v
    }
  }
  return JSON.stringify(cleaned, null, 1)
    .replace(/[{}]/g, '')
    .replace(/^\s+/gm, '  ')
    .trim()
}
