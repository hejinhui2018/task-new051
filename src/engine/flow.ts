import type { Persona, StepDef } from './types'
import { initialFlags } from './types'

/**
 * OnboardTrace 示例引导流程。
 * 同一逻辑步骤有多个版本，由 product / design / legal 分别维护；
 * 运行时按“版本覆盖 → 第一个 visibleWhen 满足”的顺序选择生效版本。
 *
 * 路径概览：
 *   welcome → accountType(choice)
 *     ├─ business → businessVerify（仅企业，法务 v2 强制补充资料）
 *     └─ personal → ageGate（仅个人；design v2 可折叠）
 *   → privacy（法务必答；eu 区域展示 legal v2 GDPR 版本）
 *   → tos（法务必答，legal v2 不允许跳过，v1 允许）
 *   → cookies（仅 eu，可“全部拒绝”= 完成而非跳过）
 *   → notifications（design 的开关步骤，mobile 隐藏）
 *   → planPick（邀请码分支：pro / free）
 *   → complete
 */
export const STEPS: StepDef[] = [
  {
    id: 'welcome',
    kind: 'welcome',
    next: 'accountType',
    versions: [
      {
        v: 'v1',
        owner: 'design',
        note: '首版欢迎页',
        skippable: false,
        required: true,
        title: '欢迎使用',
        body: '这是一版标准欢迎页，点击继续开始账号设置。',
      },
      {
        v: 'v2',
        owner: 'product',
        note: '产品改版：突出价值点',
        skippable: false,
        required: true,
        title: '3 步完成开户',
        body: '产品 v2：用进度清单替代欢迎语，强调“只需 3 步”。',
      },
    ],
  },
  {
    id: 'accountType',
    kind: 'choice',
    next: [
      { when: 'accountType == "business"', to: 'businessVerify', label: '企业账号 → 企业补充资料' },
      { when: 'accountType == "personal"', to: 'ageGate', label: '个人账号 → 年龄确认' },
    ],
    versions: [
      {
        v: 'v1',
        owner: 'product',
        note: '两个大卡片',
        skippable: false,
        required: true,
        title: '账号类型',
        body: '请选择你要开通的账号类型。',
        options: [
          { value: 'personal', label: '个人账号' },
          { value: 'business', label: '企业账号' },
        ],
      },
      {
        v: 'v2',
        owner: 'design',
        note: '设计改版：分段控件',
        skippable: false,
        required: true,
        title: '你为谁开户？',
        body: '设计 v2：使用分段控件，默认聚焦个人账号。',
        options: [
          { value: 'personal', label: '个人' },
          { value: 'business', label: '企业' },
        ],
      },
    ],
  },
  {
    id: 'businessVerify',
    kind: 'consent',
    gate: 'accountType == "business"',
    next: 'privacy',
    versions: [
      {
        v: 'v1',
        owner: 'legal',
        note: '法务首版企业承诺函',
        skippable: false,
        required: true,
        title: '企业信息真实性承诺',
        body: 'legal v1：勾选承诺企业资料真实有效，不可跳过。',
        sets: { ageVerified: true },
      },
      {
        v: 'v2',
        owner: 'legal',
        note: '法务 v2：增加法务声明措辞',
        skippable: false,
        required: true,
        title: '企业主体核验与承诺（v2）',
        body: 'legal v2：新增反洗钱与主体追责条款，仍为强制必答。',
        sets: { ageVerified: true },
      },
    ],
  },
  {
    id: 'ageGate',
    kind: 'toggle',
    gate: 'accountType == "personal"',
    field: 'ageVerified',
    next: 'privacy',
    versions: [
      {
        v: 'v1',
        owner: 'product',
        note: '必须勾选年龄',
        skippable: false,
        required: true,
        title: '确认你已年满 18 岁',
        body: 'product v1：单一必勾选项，未勾选不能继续。',
      },
      {
        v: 'v2',
        owner: 'design',
        note: '折叠在“更多信息”里',
        skippable: true,
        required: true,
        title: '年龄确认（可折叠）',
        body: 'design v2：把年龄确认折叠，允许先跳过 —— 验收时重点看“主动跳过必答”。',
      },
    ],
  },
  {
    id: 'privacy',
    kind: 'consent',
    next: 'tos',
    versions: [
      {
        v: 'v1',
        owner: 'legal',
        visibleWhen: 'region != "eu"',
        note: '通用隐私确认，可跳过（非欧盟）',
        skippable: true,
        title: '隐私政策',
        body: 'legal v1：一行概括 + 链接，允许跳过（历史行为，验收基线）。',
        sets: { privacyAccepted: true },
      },
      {
        v: 'v2',
        owner: 'legal',
        visibleWhen: 'region == "eu"',
        note: 'GDPR 版本：必答不可跳过',
        skippable: false,
        required: true,
        title: '隐私政策（GDPR 版）',
        body: 'legal v2：仅欧盟用户可见，明示数据处理目的，强制必答。',
        sets: { privacyAccepted: true },
      },
      {
        v: 'v3',
        owner: 'product',
        note: '产品加了营销勾选说明',
        skippable: true,
        title: '隐私与营销说明',
        body: 'product v3：在法务文案旁补充“我们如何使用你的数据做推荐”。',
        sets: { privacyAccepted: true },
      },
    ],
  },
  {
    id: 'tos',
    kind: 'consent',
    next: 'cookies',
    versions: [
      {
        v: 'v1',
        owner: 'legal',
        note: '旧版服务条款：可跳过',
        skippable: true,
        title: '服务条款',
        body: 'legal v1：旧版，允许跳过 —— 与 v2 形成版本边界对比。',
        sets: { tosAccepted: true },
      },
      {
        v: 'v2',
        owner: 'legal',
        note: '新版服务条款：强制必答',
        skippable: false,
        required: true,
        title: '服务条款（v2 必答）',
        body: 'legal v2：新规要求明确同意，未勾选时继续按钮禁用。',
        sets: { tosAccepted: true },
      },
    ],
  },
  {
    id: 'cookies',
    kind: 'choice',
    gate: 'region == "eu"',
    next: 'notifications',
    versions: [
      {
        v: 'v1',
        owner: 'design',
        note: '接受 / 拒绝 二选一',
        skippable: false,
        title: 'Cookie 偏好',
        body: 'design v1：欧盟用户必现。“全部拒绝”是有效提交，不算跳过。',
        options: [
          { value: 'accept', label: '全部接受' },
          { value: 'reject', label: '全部拒绝' },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    kind: 'toggle',
    gate: 'device != "mobile"',
    field: 'marketingEmail',
    next: 'planPick',
    versions: [
      {
        v: 'v1',
        owner: 'product',
        note: '默认关闭营销邮件',
        skippable: true,
        title: '通知与营销',
        body: 'product v1：桌面端展示的开关；移动端直接不展示（条件不满足）。',
      },
      {
        v: 'v2',
        owner: 'design',
        note: '重设计开关样式',
        skippable: true,
        title: '想收到哪些通知？',
        body: 'design v2：开关加了图标与说明文案。',
      },
    ],
  },
  {
    id: 'planPick',
    kind: 'choice',
    next: [
      { when: 'plan == "pro" || inviteCode != ""', to: 'complete', label: 'Pro / 邀请码用户 → 完成（跳过支付引导）' },
      { when: 'plan == "free"', to: 'complete', label: '免费用户 → 完成' },
    ],
    versions: [
      {
        v: 'v1',
        owner: 'product',
        note: '免费 / Pro 两个方案',
        skippable: false,
        required: true,
        title: '选择方案',
        body: 'product v1：选择后完成引导。',
        options: [
          { value: 'free', label: '免费版' },
          { value: 'pro', label: 'Pro 版' },
        ],
      },
    ],
  },
  {
    id: 'complete',
    kind: 'complete',
    versions: [
      {
        v: 'v1',
        owner: 'design',
        note: '标准完成页',
        skippable: false,
        title: '全部就绪',
        body: '引导完成。',
      },
      {
        v: 'v2',
        owner: 'product',
        note: '产品加了下一步行动卡片',
        skippable: false,
        title: '开始你的第一个项目',
        body: 'product v2：完成页引导创建首个项目。',
      },
    ],
  },
]

export const STEP_MAP: Record<string, StepDef> = Object.fromEntries(
  STEPS.map((s) => [s.id, s]),
)

export const START_STEP = 'welcome'
export const END_STEP = 'complete'

/** 验收预设：覆盖不同设备、地区、账号类型，专门触发各类边界 */
export const PERSONAS: Persona[] = [
  {
    id: 'p-cn-desktop',
    name: '中国 · 桌面 · 个人',
    description: '桌面端中国个人用户：不展示 cookies / GDPR，通知步骤可见',
    device: 'desktop',
    flags: { ...initialFlags, region: 'cn', accountType: 'personal' },
  },
  {
    id: 'p-eu-mobile',
    name: '欧盟 · 移动 · 个人',
    description: '移动端欧盟用户：GDPR 隐私 v2 必答、cookies 必现、通知步骤条件不满足',
    device: 'mobile',
    flags: { ...initialFlags, region: 'eu', accountType: 'personal' },
  },
  {
    id: 'p-us-business',
    name: '美国 · 桌面 · 企业',
    description: '桌面企业用户：走 businessVerify 分支，绕开 ageGate',
    device: 'desktop',
    flags: { ...initialFlags, region: 'us', accountType: 'business' },
  },
  {
    id: 'p-eu-business-invite',
    name: '欧盟 · 桌面 · 企业+邀请码',
    description: '企业且带邀请码：用于验证邀请码分支与重复运行',
    device: 'desktop',
    flags: { ...initialFlags, region: 'eu', accountType: 'business', inviteCode: 'WELCOME' },
  },
]
