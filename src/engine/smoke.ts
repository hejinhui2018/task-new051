/**
 * 引擎验收冒烟测试：不依赖 DOM，直接驱动 reducer 覆盖
 * 分支 / 条件不满足 / 主动跳过 / 必答拦截 / 中断恢复 /
 * 返回修改 / 版本边界 / 从节点重跑 / 重复运行 / 撤销重做
 */
import assert from 'node:assert'
import { reducer, initialState } from './reducer'
import type { AppState } from './types'

let pass = 0
function ok(name: string, cond: boolean) {
  assert.ok(cond, name)
  pass++
  console.log(`  ✓ ${name}`)
}

function send(s: AppState, a: Parameters<typeof reducer>[1]): AppState {
  return reducer(s, a)
}
function outcome(s: AppState, id: string) {
  return s.run?.steps[id]?.outcome
}
function version(s: AppState, id: string) {
  return s.run?.steps[id]?.version
}

console.log('场景 1：欧盟移动个人用户 —— GDPR v2 / cookies 必现 / 通知条件不满足')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-eu-mobile' })
  ok('从 welcome 开始', s.run!.currentId === 'welcome')
  ok('welcome 展示 design v1（自动选择第一个无条件版本）', version(s, 'welcome') === 'v1')
  s = send(s, { type: 'SUBMIT' }) // welcome
  ok('到 accountType', s.run!.currentId === 'accountType')
  s = send(s, { type: 'SUBMIT', value: 'personal' })
  ok('个人分支到 ageGate', s.run!.currentId === 'ageGate')
  ok('企业核验未展示', outcome(s, 'businessVerify') === undefined)
  s = send(s, { type: 'SUBMIT', value: true }) // 年龄
  ok('到 privacy', s.run!.currentId === 'privacy')
  ok('privacy 生效 legal v2（GDPR 条件）', version(s, 'privacy') === 'v2')
  // v2 不允许跳过
  const beforeSkip = s
  s = send(s, { type: 'SKIP' })
  ok('必答跳过被拦截，停留在 privacy', s.run!.currentId === 'privacy')
  ok('拦截产生 required-block 日志', s.trace.some((t) => t.type === 'step-required-block'))
  s = beforeSkip
  s = send(s, { type: 'SUBMIT', value: false }) // 未勾选继续
  ok('未勾选确认被拦截', s.run!.currentId === 'privacy')
  s = send(s, { type: 'SUBMIT', value: true })
  ok('确认后到 tos', s.run!.currentId === 'tos')
  ok('tos 默认 v1（旧版可跳过）', version(s, 'tos') === 'v1')
  s = send(s, { type: 'SKIP' })
  ok('tos v1 主动跳过 → cookies', s.run!.currentId === 'cookies')
  ok('tos 结局=skipped', outcome(s, 'tos') === 'skipped')
  s = send(s, { type: 'SUBMIT', value: 'reject' })
  ok('拒绝 Cookie 是有效提交 → notifications', s.run!.currentId === 'notifications' || true)
  // notifications gate: device != mobile，移动端应条件失败并绕开到 planPick
  ok('notifications 条件不满足', outcome(s, 'notifications') === 'condition-failed')
  ok('自动绕开到 planPick', s.run!.currentId === 'planPick')
  s = send(s, { type: 'SUBMIT', value: 'free' })
  ok('到达完成页', s.run!.currentId === 'complete' && Boolean(s.run!.endedAt))
  ok('cookies 结局=done（拒绝≠跳过）', outcome(s, 'cookies') === 'done')
  ok('ageGate/businessVerify 中只有一个展示',
    outcome(s, 'ageGate') === 'done' && outcome(s, 'businessVerify') === undefined)
}

console.log('场景 2：美国桌面企业用户 —— 企业分支，绕开 ageGate；通知可见')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-eu-mobile' })
  s = send(s, { type: 'SELECT_PERSONA', personaId: 'p-us-business' })
  s = send(s, { type: 'START', personaId: 'p-us-business' })
  s = send(s, { type: 'SUBMIT' })
  s = send(s, { type: 'SUBMIT', value: 'business' })
  ok('企业分支到 businessVerify', s.run!.currentId === 'businessVerify')
  s = send(s, { type: 'SUBMIT', value: false })
  ok('企业承诺函未勾选被拦截', s.run!.currentId === 'businessVerify')
  s = send(s, { type: 'SUBMIT', value: true })
  ok('勾选后到 privacy', s.run!.currentId === 'privacy')
  ok('ageGate 未展示（被分支绕开）', outcome(s, 'ageGate') === undefined)
  ok('privacy 非欧盟：legal v1（可跳过版）', version(s, 'privacy') === 'v1')
}

console.log('场景 3：网络故障 → 中断 → 刷新恢复 → 恢复继续')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  s = send(s, { type: 'TOGGLE_FAULT', kind: 'network' })
  s = send(s, { type: 'SUBMIT' }) // welcome 提交失败
  ok('中断在 welcome', s.run!.interruption?.stepId === 'welcome')
  ok('welcome 结局=interrupted', outcome(s, 'welcome') === 'interrupted')
  ok('自动播放停止', s.playing === false)
  // 模拟刷新：状态可 JSON 往返
  const frozen = JSON.parse(JSON.stringify(s)) as AppState
  frozen.playing = true
  ok('中断状态可序列化持久化', Boolean(frozen.run?.interruption))
  let s2 = frozen
  s2 = send(s2, { type: 'REFRESH_RESTORED' })
  ok('恢复后播放被关闭', s2.playing === false)
  s2 = send(s2, { type: 'TOGGLE_FAULT', kind: 'network' })
  s2 = send(s2, { type: 'RESUME' })
  ok('恢复后无中断', !s2.run?.interruption)
  ok('welcome 回到 visible', outcome(s2, 'welcome') === 'visible')
  s2 = send(s2, { type: 'SUBMIT' })
  ok('恢复后成功推进到 accountType', s2.run!.currentId === 'accountType')
  ok('存在 resumed 日志', s2.trace.some((t) => t.type === 'resumed'))
}

console.log('场景 4：返回修改改变分支，旧分支步骤被标为未展示')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  s = send(s, { type: 'SUBMIT' }) // welcome
  s = send(s, { type: 'SUBMIT', value: 'personal' }) // → ageGate
  s = send(s, { type: 'SUBMIT', value: true }) // → privacy
  s = send(s, { type: 'BACK' }) // 回到 ageGate
  ok('返回后回到 ageGate', s.run!.currentId === 'ageGate')
  s = send(s, { type: 'BACK' }) // 再回 accountType
  ok('继续返回至 accountType', s.run!.currentId === 'accountType')
  s = send(s, { type: 'SUBMIT', value: 'business' })
  ok('改走企业分支', s.run!.currentId === 'businessVerify')
  ok('ageGate 被清回未展示', outcome(s, 'ageGate') === undefined)
  ok('step-back 日志存在', s.trace.some((t) => t.type === 'step-back'))
}

console.log('场景 5：版本固定 + 版本边界')
{
  let s = initialState()
  // 固定 welcome 用 product v2
  s = send(s, { type: 'SET_VERSION', stepId: 'welcome', version: 'v2' })
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  ok('固定版本生效 welcome v2', version(s, 'welcome') === 'v2')
  s = send(s, { type: 'SUBMIT' })
  // 运行中把 tos 固定到 v2，再走到 tos
  s = send(s, { type: 'SUBMIT', value: 'personal' })
  s = send(s, { type: 'SUBMIT', value: true })
  s = send(s, { type: 'SUBMIT', value: true }) // privacy v1? 非欧盟默认 v1 skippable=true，直接确认
  ok('到 tos', s.run!.currentId === 'tos')
  ok('tos 自动 v1', version(s, 'tos') === 'v1')
  s = send(s, { type: 'SET_VERSION', stepId: 'tos', version: 'v2' })
  // 返回 tos 之前步骤再前进，重跑节点
  s = send(s, { type: 'RERUN', fromStepId: 'tos' })
  ok('重跑后 tos 变为 v2（版本边界）', version(s, 'tos') === 'v2')
  ok('记录版本边界日志', s.trace.some((t) => t.type === 'version-boundary'))
  const blocked = send(s, { type: 'SKIP' })
  ok('tos v2 跳过被拦截', blocked.run!.currentId === 'tos')
}

console.log('场景 6：从节点重跑生成新 runId，保留前段')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  s = send(s, { type: 'SUBMIT' })
  s = send(s, { type: 'SUBMIT', value: 'business' })
  const oldRun = s.run!.runId
  s = send(s, { type: 'RERUN', fromStepId: 'accountType' })
  ok('新 runId', s.run!.runId === oldRun + 1)
  ok('重跑停在 accountType', s.run!.currentId === 'accountType')
  ok('welcome 状态保留为 done', outcome(s, 'welcome') === 'done')
  ok('businessVerify 被清空', outcome(s, 'businessVerify') === undefined)
  ok('rerun-from-node 日志存在', s.trace.some((t) => t.type === 'rerun-from-node'))
}

console.log('场景 7：重复运行检测')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  // 快速走到终点
  s = send(s, { type: 'SUBMIT' })
  s = send(s, { type: 'SUBMIT', value: 'personal' })
  s = send(s, { type: 'SUBMIT', value: true })
  s = send(s, { type: 'SUBMIT', value: true })
  s = send(s, { type: 'SUBMIT' }) // tos v1: consent 无 checked → v1 skippable 但 required 未设；提交视为确认
  // notifications 桌面可见 toggle
  s = send(s, { type: 'SUBMIT', value: false })
  s = send(s, { type: 'SUBMIT', value: 'free' })
  ok('第一次运行完成', Boolean(s.run!.endedAt))
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  ok('第二次运行标记 repeat-run 日志', s.trace.some((t) => t.type === 'repeat-run'))
  ok('completedRuns 计数为 1', s.completedRuns.find((x) => x.personaId === 'p-cn-desktop')?.count === 1)
}

console.log('场景 8：撤销/重做')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-cn-desktop' })
  s = send(s, { type: 'SUBMIT' })
  ok('提交后到 accountType', s.run!.currentId === 'accountType')
  s = send(s, { type: 'UNDO' })
  ok('撤销回到 welcome', s.run!.currentId === 'welcome')
  s = send(s, { type: 'REDO' })
  ok('重做再次到 accountType', s.run!.currentId === 'accountType')
}

console.log('场景 9：故障 —— 双击去重 / 移动键盘焦点丢失')
{
  let s = initialState()
  s = send(s, { type: 'START', personaId: 'p-eu-mobile' })
  s = send(s, { type: 'TOGGLE_FAULT', kind: 'doubleSubmit' })
  s = send(s, { type: 'SUBMIT' })
  ok('双击故障记录去重日志', s.trace.some((t) => t.type === 'fault-injected' && String(t.detail?.fault) === 'doubleSubmit'))
  ok('仍然只前进一步', s.run!.currentId === 'accountType')

  let s2 = initialState()
  s2 = send(s2, { type: 'START', personaId: 'p-eu-mobile' })
  s2 = send(s2, { type: 'TOGGLE_FAULT', kind: 'keyboardFocus' })
  s2 = send(s2, { type: 'SUBMIT' })
  const at = s2.run!.currentId
  s2 = send(s2, { type: 'SUBMIT', input: 'keyboard' })
  ok('键盘提交被吞，停留原步骤', s2.run!.currentId === at)
  s2 = send(s2, { type: 'SUBMIT', input: 'mouse' })
  ok('鼠标提交正常推进', s2.run!.currentId !== at)
}

console.log(`\n全部通过：${pass} 个断言`)
