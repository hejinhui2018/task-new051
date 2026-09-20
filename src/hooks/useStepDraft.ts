import { useEffect, useState } from 'react'
import { STEP_MAP } from '../engine/flow'
import type { RunState } from '../engine/types'

/** 步骤内控件的临时草稿（选项 / 勾选 / 开关），随“运行+步骤+版本”切换重置 */
export interface StepDraft {
  choice?: string
  checked?: boolean
  toggleOn?: boolean
}

function initialDraft(run: RunState | null, stepId: string): StepDraft {
  if (!run || !stepId) return {}
  const def = STEP_MAP[stepId]
  const rt = run.steps[stepId]
  if (!def || !rt || rt.outcome !== 'visible') return {}
  if (def.kind === 'choice') {
    const prev = rt.choice as { value?: unknown } | undefined
    return { choice: (prev?.value as string) ?? def.versions[0]?.options?.[0]?.value }
  }
  if (def.kind === 'toggle' && def.field) {
    return { toggleOn: Boolean(run.flags[def.field]) }
  }
  if (def.kind === 'consent') return { checked: false }
  return {}
}

export function useStepDraft(run: RunState | null): [StepDraft, (d: Partial<StepDraft>) => void] {
  const stepId = run?.currentId ?? ''
  const version = run && stepId ? run.steps[stepId]?.version : undefined
  const runId = run?.runId ?? 0
  const [draft, setDraftState] = useState<StepDraft>(() => initialDraft(run, stepId))

  useEffect(() => {
    setDraftState(initialDraft(run, stepId))
    // runId/stepId/version 任一变化都代表“换了一屏”，需要重置草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, stepId, version])

  const patch = (d: Partial<StepDraft>) => setDraftState((prev) => ({ ...prev, ...d }))
  return [draft, patch]
}
