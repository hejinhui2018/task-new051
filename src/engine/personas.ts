import { STEP_MAP } from './flow';
import { resolveVersion } from './engine';
import type { Ctx, InputKind, PersonaId, SimState, StepVersion } from './types';

export interface Persona {
  id: PersonaId;
  name: string;
  desc: string;
}

export const PERSONAS: Persona[] = [
  { id: 'cooperative', name: '配合型用户', desc: '全部填写/勾选，正常确认' },
  { id: 'skipper', name: '跳过型用户', desc: '凡能跳过一律跳过，被拦后才补最小必填项' },
  { id: 'enterprise', name: '企业客户', desc: '选择企业账户，走域名验证与邀请分支' },
  { id: 'explorer', name: '探索型用户', desc: '中途返回修改账户类型，个人线改走企业线' },
];

export type AutoAction =
  | { kind: 'primary'; choiceId?: string; values: Ctx }
  | { kind: 'skip' }
  | { kind: 'back' };

function fillRequired(v: StepVersion, persona: PersonaId, opts?: { company?: string }): Ctx {
  const values: Ctx = {};
  for (const f of v.fields ?? []) {
    if (!f.required) continue;
    if (f.type === 'checkbox') values[f.key] = true;
    else if (f.key === 'company') values[f.key] = opts?.company ?? '示例科技有限公司';
    else if (f.key === 'name') values[f.key] = persona === 'skipper' ? '李跳过' : '张小明';
    else values[f.key] = '自动填写';
  }
  return values;
}

/**
 * 拟人决策：返回下一步操作。explorer 的“返回改账户类型”是有状态的，
 * 用外部 meta.explorerWentBack 记录，避免在业务 ctx 里塞模拟器字段。
 */
export function decide(
  state: SimState,
  meta: { explorerWentBack: boolean },
): AutoAction | null {
  const curId = state.current;
  if (state.status !== 'running' || !curId) return null;
  const step = STEP_MAP[curId];
  const v = resolveVersion(step, {
    ctx: state.ctx,
    device: state.config.device,
    region: state.config.region,
  });
  const persona = state.config.personaId;

  // explorer：走到条款页才反悔，连续返回到账户类型，改成企业线
  if (persona === 'explorer' && !meta.explorerWentBack && curId === 'legal_terms') {
    return { kind: 'back' };
  }
  if (persona === 'explorer' && !meta.explorerWentBack) {
    if (curId !== 'account_type' && ['notification_pref', 'privacy_consent', 'profile_form'].includes(curId)) {
      return { kind: 'back' };
    }
    if (curId === 'account_type' && state.path.length > 1 && state.ctx.plan === 'personal') {
      meta.explorerWentBack = true;
      return { kind: 'primary', choiceId: 'enterprise', values: fillRequired(v, persona) };
    }
  }

  switch (v.kind) {
    case 'choice': {
      if (persona === 'skipper' && v.skippable) return { kind: 'skip' };
      let choiceId: string | undefined;
      if (curId === 'account_type') {
        const wantsEnterprise = persona === 'enterprise' || persona === 'explorer';
        const hasEnterprise = v.choices?.some((c) => c.id === 'enterprise');
        // 命中的版本若没有企业入口（如 CN 旧版），只能退到版本提供的第一个选项
        choiceId = wantsEnterprise && hasEnterprise ? 'enterprise' : 'personal';
        if (persona === 'explorer' && !meta.explorerWentBack && hasEnterprise) {
          // explorer 第一次先选个人，返回修改后才改企业（若版本无企业入口则无法演示该路径）
          choiceId = 'personal';
        }
        if (!v.choices?.some((c) => c.id === choiceId)) choiceId = v.choices?.[0]?.id;
      } else if (curId === 'invite_team') {
        choiceId = persona === 'skipper' ? 'inviteLater' : 'inviteNow';
      } else {
        choiceId = persona === 'skipper' ? v.choices?.[v.choices.length - 1]?.id : v.choices?.[0]?.id;
      }
      if (!choiceId && v.skippable) return { kind: 'skip' };
      return { kind: 'primary', choiceId, values: {} };
    }
    case 'form':
      return { kind: 'primary', values: fillRequired(v, persona) };
    case 'consent':
      if (persona === 'skipper' && v.skippable) return { kind: 'skip' };
      return { kind: 'primary', values: fillRequired(v, persona) };
    case 'info':
    case 'complete':
    default:
      return { kind: 'primary', values: {} };
  }
}

/** 不同设备的操作习惯：桌面端主操作用键盘（Enter），移动端全部点按 */
export function inputKindFor(
  device: SimState['config']['device'],
  action: AutoAction['kind'],
  seq: number,
): InputKind {
  if (device === 'desktop') {
    if (action === 'primary') return 'keyboard'; // Enter
    if (action === 'back') return 'keyboard'; // Alt + ← / Backspace
    return seq % 2 === 0 ? 'keyboard' : 'click'; // Esc 跳过
  }
  if (device === 'tablet') return seq % 3 === 0 ? 'keyboard' : 'click';
  return 'click';
}
