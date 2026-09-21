import { useEffect, useMemo, useState } from 'react';
import { STEP_MAP } from '../engine/flow';
import { resolveVersion } from '../engine/engine';
import type { Ctx, SimState } from '../engine/types';
import { store } from '../hooks';

const OWNER_LABEL = { product: '产品', design: '设计', legal: '法务' } as const;
const DEVICE_LABEL = { desktop: '桌面端', tablet: '平板', mobile: '手机' } as const;

export function DeviceStage({ sim }: { sim: SimState }) {
  const curId = sim.current;
  const step = curId ? STEP_MAP[curId] : null;
  const ns = curId ? sim.nodes[curId] : null;
  const version = useMemo(
    () => (step ? resolveVersion(step, { ctx: sim.ctx, device: sim.config.device, region: sim.config.region }) : null),
    [step, sim.ctx, sim.config.device, sim.config.region],
  );

  const [choiceId, setChoiceId] = useState<string | undefined>();
  const [values, setValues] = useState<Ctx>({});

  // 进入新步骤（或重新渲染）时清空本地草稿
  const formKey = `${sim.runId}:${curId}:${ns?.renders ?? 0}`;
  useEffect(() => {
    setChoiceId(undefined);
    setValues({});
  }, [formKey]);

  const interactive = sim.status === 'running' && ns?.status === 'shown';

  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      // 焦点在交互控件上时交给控件自身处理，避免重复派发
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        store.dispatch({ t: 'primary', input: 'keyboard', choiceId, values });
      } else if (e.key === 'Escape' && version?.skippable) {
        e.preventDefault();
        store.dispatch({ t: 'skip', input: 'keyboard' });
      } else if (e.key === 'Backspace' && e.altKey) {
        e.preventDefault();
        store.dispatch({ t: 'back', input: 'keyboard' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, choiceId, values, version?.skippable]);

  const blocked = ns?.blocked[ns.blocked.length - 1];

  return (
    <div className="stage">
      <div className={`device-frame ${sim.config.device}`}>
        <div className="device-bar">
          <span>{DEVICE_LABEL[sim.config.device]}</span>
          <span>
            {sim.config.region} · 输入：{sim.config.device === 'mobile' ? '点按' : '键盘+鼠标'}
          </span>
        </div>

        {!step || !ns || !version ? (
          <div className="screen" style={{ justifyContent: 'center' }}>
            <div className="idle-hint">
              <div className="big">🧭</div>
              在顶栏选择设备、地区与拟人策略后点击「开始运行」。
              <br />
              也可以直接在屏幕上手动操作完成验收。
            </div>
          </div>
        ) : ns.status === 'loading' ? (
          <div className="screen loading">
            <div className="spinner" />
            <div>「{version.title}」渲染中（慢加载故障）…</div>
          </div>
        ) : (
          <div className="screen">
            <span className={`s-owner ${version.owner}`}>
              {OWNER_LABEL[version.owner]}版本 {version.version}
              <span className="s-ver">
                {version.publishedAt} · {step.required ? '必要确认' : '可选步骤'}
              </span>
            </span>
            <h2>{version.title}</h2>
            {version.body && <div className="s-body">{version.body}</div>}

            {version.choices && (
              <div className="choice-list">
                {version.choices.map((c) => (
                  <button
                    key={c.id}
                    className={`choice ${choiceId === c.id ? 'selected' : ''}`}
                    disabled={!interactive}
                    onClick={() => {
                      setChoiceId(c.id);
                      store.dispatch({ t: 'primary', input: 'click', choiceId: c.id, values: {} });
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {version.fields?.map((f) => (
              <div className="field" key={f.key}>
                {f.type === 'checkbox' ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={values[f.key] === true}
                      disabled={!interactive}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                    />
                    {f.label}
                    {f.required && <span className="req">必要</span>}
                  </label>
                ) : (
                  <>
                    <label>
                      {f.label}
                      {f.required && <span className="req">必填</span>}
                    </label>
                    <input
                      type="text"
                      value={typeof values[f.key] === 'string' ? (values[f.key] as string) : ''}
                      placeholder={f.placeholder}
                      disabled={!interactive}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          store.dispatch({ t: 'primary', input: 'keyboard', choiceId, values });
                      }}
                    />
                  </>
                )}
              </div>
            ))}

            {blocked && <div className="blocked-note">⚠ {blocked.reason}</div>}

            <div className="screen-actions">
              <button
                className="back-btn"
                disabled={!interactive || sim.path.length <= 1}
                onClick={() => store.dispatch({ t: 'back', input: 'click' })}
                title="返回上一步（Alt+← / Alt+Backspace）"
              >
                ← 返回
              </button>
              {version.skippable && (
                <button
                  className="skip-btn"
                  disabled={!interactive}
                  onClick={() => store.dispatch({ t: 'skip', input: 'click' })}
                  title="Esc"
                >
                  {version.skipLabel ?? '跳过'}
                </button>
              )}
              {version.kind !== 'choice' && (
                <button
                  className="primary"
                  disabled={!interactive}
                  onClick={() => store.dispatch({ t: 'primary', input: 'click', choiceId, values })}
                >
                  {version.primaryLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {interactive && sim.config.device !== 'mobile' && (
        <div className="kbd-hint">
          键盘：<kbd>Enter</kbd> 确认 · <kbd>Esc</kbd> 跳过 · <kbd>Alt</kbd>+<kbd>←</kbd> 返回
        </div>
      )}
    </div>
  );
}
