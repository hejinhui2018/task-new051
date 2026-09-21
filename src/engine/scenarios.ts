import { createInitialState, reduce } from './engine';
import { STEP_MAP } from './flow';
import type { Cmd, Effect, RunConfig, SimState, TraceEvent } from './types';

export interface CheckResult {
  desc: string;
  pass: boolean;
  detail?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  results: CheckResult[];
  eventCount: number;
}

/** 确定性测试台：把引擎的延迟副作用（慢加载完成）立即排空，不依赖时钟 */
class Harness {
  s: SimState;
  constructor(config: RunConfig) {
    this.s = createInitialState();
    this.send({ t: 'start', config });
  }
  send(cmd: Cmd) {
    const r = reduce(this.s, cmd);
    this.s = r.state;
    this.drain(r.effects);
  }
  private drain(effects: Effect[]) {
    for (const eff of effects) this.send(eff.cmd);
  }
  status(id: string) {
    return this.s.nodes[id]?.status ?? 'unseen';
  }
  ev(type: string): TraceEvent | undefined {
    return this.s.events.find((e) => e.type === type);
  }
  evCount(type: string): number {
    return this.s.events.filter((e) => e.type === type).length;
  }
  check(desc: string, fn: (s: SimState) => boolean, detail?: (s: SimState) => string): CheckResult {
    let pass = false;
    let d: string | undefined;
    try {
      pass = fn(this.s);
      if (!pass) d = detail ? detail(this.s) : undefined;
    } catch (e) {
      d = String(e);
    }
    return { desc, pass, detail: d };
  }
}

export interface Scenario {
  id: string;
  title: string;
  desc: string;
  expect: string[];
  config: RunConfig;
  run: (h: Harness, assert: (desc: string, fn: (s: SimState) => boolean, detail?: (s: SimState) => string) => void) => void;
}

const fill = (vals: Record<string, string | boolean>) => ({ t: 'primary', input: 'click', values: vals }) as const;
const click = (choiceId?: string) => ({ t: 'primary', input: 'click', choiceId, values: {} }) as const;

export const SCENARIOS: Scenario[] = [
  {
    id: 'branch-enterprise',
    title: '条件分支：企业线',
    desc: '桌面/美区企业客户，验证企业验证与邀请分支展示、个人线节点记为条件不满足。',
    expect: ['企业节点 confirmed', '通知偏好 condition_failed', '条款命中 v4', '运行完成'],
    config: { device: 'desktop', region: 'US', personaId: 'enterprise' },
    run: (h, a) => {
      h.send(fill({})); // welcome
      h.send(click('enterprise')); // account v3（美区基线）
      h.send(fill({ name: '王企业', company: 'Acme', agreeProfile: true })); // profile v3
      h.send(fill({})); // privacy US v3
      h.send(fill({})); // enterprise_verify
      h.send(click('inviteNow')); // invite v2 桌面版
      // notification_pref visible=false，自动顺延，无需操作
      h.send(fill({ termsCheck: true })); // legal v4 美区基线
      h.send(fill({})); // done 完成页确认
      a('企业验证节点已确认', (s) => s.nodes.enterprise_verify.status === 'confirmed');
      a('团队邀请节点已确认', (s) => s.nodes.invite_team.status === 'confirmed');
      a('通知偏好记录为条件不满足', (s) => s.nodes.notification_pref.status === 'condition_failed');
      a('条件边 e_priv_ent 有一次满足记录', (s) => {
        const list = s.edgeEvals.e_priv_ent;
        return !!list && list[list.length - 1]?.result === true;
      });
      a('条款版本 = us-v4', (s) => s.ctx.termsVersion === 'us-v4', (s) => `实际 ${s.ctx.termsVersion}`);
      a('运行完成', (s) => s.status === 'completed');
    },
  },
  {
    id: 'back-personal-to-enterprise',
    title: '返回修改：个人线改企业线',
    desc: '先选个人并跳过隐私，到通知偏好后逐级返回，改选企业；下游失效化、上下文按键回收、版本重判。',
    expect: ['下游节点 invalidated', 'privacy 被回收', '资料表单重判为 v3', '改线后可完成'],
    config: { device: 'desktop', region: 'CN', personaId: 'explorer' },
    run: (h, a) => {
      h.send(fill({})); // welcome
      h.send(click('personal'));
      h.send(fill({ name: '张小明' }));
      h.send({ t: 'skip', input: 'click' }); // CN privacy v1 可跳过
      // 当前在 notification_pref
      h.send({ t: 'back', input: 'keyboard' }); // 回隐私
      h.send({ t: 'back', input: 'keyboard' }); // 回资料
      h.send({ t: 'back', input: 'keyboard' }); // 回账户类型
      a('隐私/通知偏好已失效', (s) => ['invalidated'].includes(s.nodes.privacy_consent.status) && s.nodes.notification_pref.status === 'invalidated');
      a('跳过写入的 privacy 已回收', (s) => s.ctx.privacy === undefined, (s) => `实际 ${String(s.ctx.privacy)}`);
      a('资料写入的 name/profileDone 已回收', (s) => s.ctx.name === undefined && s.ctx.profileDone === undefined);
      a('产生失效化事件', (s) => s.events.some((e) => e.type === 'node_invalidated'));

      h.send(click('enterprise'));
      a('资料表单重判为法务 v3（公司必填）', (s) => s.selectedVersions.profile_form === 'v3', (s) => `实际 ${s.selectedVersions.profile_form}`);
      h.send(fill({ name: '王企业', company: 'Acme', agreeProfile: true }));
      h.send(fill({})); // CN privacy v1 确认
      h.send(fill({})); // enterprise verify
      h.send(click('inviteNow'));
      h.send(fill({ termsCheck: true }));
      h.send(fill({})); // done
      a('改线后完成', (s) => s.status === 'completed');
      a('最终 plan=enterprise', (s) => s.ctx.plan === 'enterprise');
    },
  },
  {
    id: 'version-boundaries',
    title: '版本边界：条款四地区/设备矩阵',
    desc: '重复运行四次（EU桌面/US手机/CN桌面/US桌面），验证法务条款与隐私版本边界。',
    expect: ['eu-dpa-v2', 'mobile-v3', 'cn-v1', 'us-v4', 'EU 隐私不可跳过'],
    config: { device: 'desktop', region: 'US', personaId: 'cooperative' },
    run: (h, a) => {
      const completions: boolean[] = [];
      let runIndex = 0;
      const personal = (config: RunConfig, privacyVals: Record<string, boolean>, termsVals: Record<string, boolean>) => {
        // 第一次调用是在构造器自动开启的初始轮上重启，不计；后三次重启时上一轮必须已完成
        if (runIndex > 0) completions.push(h.s.status === 'completed');
        runIndex += 1;
        h.send({ t: 'start', config });
        h.send(fill({})); // welcome
        h.send(click('personal'));
        h.send(fill({ name: '测试' }));
        h.send(fill(privacyVals));
        h.send(click(personaChoice(h))); // notification_pref
        h.send(fill(termsVals));
        h.send(fill({})); // done
      };
      // 1) EU 桌面
      personal({ device: 'desktop', region: 'EU', personaId: 'cooperative' }, { privacyCheck: true }, { termsCheck: true, dpaCheck: true });
      a('EU 条款 = eu-dpa-v2', (s) => s.ctx.termsVersion === 'eu-dpa-v2', (s) => `实际 ${s.ctx.termsVersion}`);
      a('EU 隐私版本 gdpr-v2', (s) => s.ctx.privacyVersion === 'gdpr-v2');
      const euPrivacySkippable = STEP_MAP.privacy_consent.versions.find((v) => v.version === 'v2')!.skippable;
      a('EU 隐私版本不可跳过', () => !euPrivacySkippable);

      // 2) US 手机
      personal({ device: 'mobile', region: 'US', personaId: 'cooperative' }, {}, { termsCheck: true });
      a('US 手机条款 = mobile-v3', (s) => s.ctx.termsVersion === 'mobile-v3', (s) => `实际 ${s.ctx.termsVersion}`);
      a('手机欢迎页命中设计 v2', (s) => s.selectedVersions.welcome === 'v2', (s) => `实际 ${s.selectedVersions.welcome}`);

      // 3) CN 桌面
      personal({ device: 'desktop', region: 'CN', personaId: 'cooperative' }, {}, { termsCheck: true });
      a('CN 条款 = cn-v1', (s) => s.ctx.termsVersion === 'cn-v1', (s) => `实际 ${s.ctx.termsVersion}`);

      // 4) US 桌面
      personal({ device: 'desktop', region: 'US', personaId: 'cooperative' }, {}, { termsCheck: true });
      a('US 桌面条款 = us-v4', (s) => s.ctx.termsVersion === 'us-v4', (s) => `实际 ${s.ctx.termsVersion}`);
      a('重复运行：每次重启前上一轮均已完成，且第 4 轮也完成', (s) =>
        completions.length === 3 && completions.every(Boolean) && s.status === 'completed',
      () => `重启前完成记录 ${completions.join(',')}，当前状态 ${h.s.status}`);
    },
  },
  {
    id: 'required-consent-blocked',
    title: '必要确认：跳过与漏勾均被拦截',
    desc: '欧盟用户在隐私步骤先尝试跳过，再不勾选直接确认，两次都留痕拦截，补齐后放行。',
    expect: ['skip_blocked', 'confirm_blocked', '拦截后仍停留', '补齐后完成'],
    config: { device: 'desktop', region: 'EU', personaId: 'skipper' },
    run: (h, a) => {
      h.send(fill({})); // welcome
      h.send(click('personal'));
      h.send(fill({ name: '测试' }));
      h.send({ t: 'skip', input: 'keyboard' });
      a('跳过被拦截（skip_blocked）', (s) => s.events.some((e) => e.type === 'skip_blocked'));
      h.send(fill({})); // 未勾选 privacyCheck
      a('漏勾被拦截（confirm_blocked）', (s) => s.events.some((e) => e.type === 'confirm_blocked'));
      a('两次拦截都记录在节点 blocked 列表', (s) => s.nodes.privacy_consent.blocked.length === 2);
      a('仍停留在隐私步骤', (s) => s.current === 'privacy_consent' && s.nodes.privacy_consent.status === 'shown');
      h.send(fill({ privacyCheck: true }));
      a('补齐后隐私已确认', (s) => s.nodes.privacy_consent.status === 'confirmed');
      h.send(click('all'));
      h.send(fill({ termsCheck: true, dpaCheck: true }));
      h.send(fill({})); // done
      a('最终完成', (s) => s.status === 'completed');
    },
  },
  {
    id: 'interrupt-resume',
    title: '中断与恢复',
    desc: '运行到隐私步骤手动中断，状态冻结；恢复后从同节点继续，且操作序列可撤销/重做。',
    expect: ['interrupted', 'resumed', '当前节点不变'],
    config: { device: 'mobile', region: 'CN', personaId: 'cooperative' },
    run: (h, a) => {
      h.send(fill({})); // welcome
      h.send(click('personal'));
      h.send(fill({ name: '测试' }));
      h.send({ t: 'interrupt', reason: 'manual' });
      a('状态为中断待恢复', (s) => s.status === 'interrupted' && s.interruptedFrom === 'privacy_consent');
      const snapshot = JSON.stringify({ ctx: h.s.ctx, path: h.s.path });
      h.send({ t: 'resume' });
      a('恢复后回到隐私步骤', (s) => s.current === 'privacy_consent' && s.status === 'running');
      a('上下文与路径无损', () => JSON.stringify({ ctx: h.s.ctx, path: h.s.path }) === snapshot);
      h.send({ t: 'skip', input: 'click' });
      a('恢复后可继续操作（隐私被跳过）', (s) => s.nodes.privacy_consent.status === 'skipped');
    },
  },
  {
    id: 'faults',
    title: '故障注入：慢加载 / 提交失败 / 崩溃',
    desc: '开始前布防慢加载，资料页布防提交失败，条款页布防崩溃后恢复完成。',
    expect: ['loading→shown', 'action_fail 后可重试', 'crash→resume 完成'],
    config: { device: 'desktop', region: 'CN', personaId: 'cooperative' },
    run: (h, a) => {
      h.send({ t: 'armFault', kind: 'slow-render' });
      h.send({ t: 'start', config: { device: 'desktop', region: 'CN', personaId: 'cooperative' } });
      a('欢迎页经历慢加载后展示', (s) => s.nodes.welcome.status === 'shown' && s.events.some((e) => e.type === 'fault_slow_end'));
      h.send(fill({})); // welcome
      h.send(click('personal'));
      h.send({ t: 'armFault', kind: 'action-fail' });
      h.send(fill({ name: '测试' }));
      a('提交失败留痕且停留', (s) => s.events.some((e) => e.type === 'fault_action_fail') && s.nodes.profile_form.blocked.length === 1);
      h.send(fill({ name: '测试' }));
      a('重试成功', (s) => s.nodes.profile_form.status === 'confirmed');
      h.send({ t: 'armFault', kind: 'crash' });
      h.send(fill({})); // 在隐私页确认时崩溃
      a('崩溃导致中断待恢复', (s) => s.status === 'interrupted' && s.events.some((e) => e.type === 'fault_crash'));
      h.send({ t: 'resume' });
      h.send(fill({}));
      h.send(click('all'));
      h.send(fill({ termsCheck: true }));
      h.send(fill({})); // done
      a('恢复后运行完成', (s) => s.status === 'completed');
    },
  },
  {
    id: 'rerun-node',
    title: '从节点重跑',
    desc: '完整跑完个人线后，从隐私授权节点重跑：下游全部失效、条件边重新求值，再次完成。',
    expect: ['下游 invalidated', '重跑后再次 confirmed', 'edge_eval 每边 ≥2 次'],
    config: { device: 'desktop', region: 'CN', personaId: 'cooperative' },
    run: (h, a) => {
      h.send(fill({})); // welcome
      h.send(click('personal'));
      h.send(fill({ name: '测试' }));
      h.send({ t: 'skip', input: 'click' });
      h.send(click('all'));
      h.send(fill({ termsCheck: true }));
      h.send(fill({})); // done
      a('首次运行完成', (s) => s.status === 'completed');
      h.send({ t: 'rerun', stepId: 'privacy_consent', input: 'click' });
      a('重跑时条款/完成/通知节点失效', (s) => ['legal_terms', 'done', 'notification_pref'].every((id) => s.nodes[id].status === 'invalidated'));
      a('回到隐私步骤且为 shown', (s) => s.current === 'privacy_consent' && s.nodes.privacy_consent.status === 'shown');
      h.send(fill({})); // 这次改为确认授权
      h.send(click('all'));
      h.send(fill({ termsCheck: true }));
      h.send(fill({})); // done
      a('重跑后再次完成', (s) => s.status === 'completed');
      a('隐私由跳过变为确认', (s) => s.nodes.privacy_consent.status === 'confirmed' && s.ctx.privacy === 'granted');
      a('条件边被重新求值（重跑点下游各边至少 2 次）', (s) =>
        ['e_priv_ent', 'e_priv_notif', 'e_notif_legal', 'e_legal_done'].every(
          (id) => (s.edgeEvals[id]?.length ?? 0) >= 2,
        ));
    },
  },
];

function personaChoice(h: Harness): string | undefined {
  // 通知偏好节点的第一个选项
  const cur = h.s.current;
  if (!cur) return undefined;
  return STEP_MAP[cur].versions.find((v) => v.version === h.s.nodes[cur].version)?.choices?.[0]?.id;
}

export function runScenario(scenario: Scenario): ScenarioResult {
  const h = new Harness(scenario.config);
  const results: CheckResult[] = [];
  scenario.run(h, (desc, fn, detail) => results.push(h.check(desc, fn, detail)));
  return { scenarioId: scenario.id, results, eventCount: h.s.events.length };
}

export function freshHarness(config: RunConfig): Harness {
  return new Harness(config);
}
