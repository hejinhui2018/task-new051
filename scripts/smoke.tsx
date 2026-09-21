const React = require('react');
const { JSDOM } = require('jsdom');
const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');

const mode = process.argv[2] ?? 'drive';
const STATE_FILE = '/tmp/ot-state.json';

async function main() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const G = globalThis;
  const w = window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'localStorage', 'SVGElement', 'getComputedStyle']) {
    try {
      G[key] = w[key] ?? G[key];
    } catch {
      Object.defineProperty(G, key, { value: w[key], configurable: true, writable: true });
    }
  }

  if (mode === 'resume' && existsSync(STATE_FILE)) {
    window.localStorage.setItem('onboard-trace-v1', readFileSync(STATE_FILE, 'utf8'));
  }

  const { default: App } = require('../src/App');
  const { store } = require('../src/store');

  const container = document.getElementById('root');
  await act(async () => {
    createRoot(container).render(React.createElement(App));
  });

  const buttons = () => Array.from(container.querySelectorAll('button'));
  const clickButton = (text: string) => {
    const b = buttons().find((x) => x.textContent?.includes(text));
    if (!b || b.disabled)
      throw new Error(`按钮不可用或不存在：${text}（可用：${buttons().map((x) => x.textContent).join('|')}）`);
    act(() => b.click());
  };
  const pillText = () => Array.from(container.querySelectorAll('.run-pill')).map((x) => x.textContent).join(' ');
  const eventCount = () => {
    const m = container.textContent?.match(/事件留痕（(\d+)）/);
    return m ? Number(m[1]) : -1;
  };
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`✗ ${msg}`);
      process.exitCode = 1;
    } else {
      console.log(`✓ ${msg}`);
    }
  };

  if (mode === 'drive') {
    assert(pillText().includes('未开始'), '初始状态为未开始');
    clickButton('开始运行');
    assert(pillText().includes('运行中'), '点击开始后运行中');
    assert(eventCount() >= 2, `开始即产生留痕事件（${eventCount()}）`);

    // 连续单步：确认欢迎(1)→账户类型(2)→资料表单(3)→隐私授权
    clickButton('单步');
    clickButton('单步');
    clickButton('单步');
    assert(
      store.getSnapshot().sim.current === 'privacy_consent',
      `单步 3 次到达隐私授权（实际 ${store.getSnapshot().sim.current}）`,
    );

    clickButton('撤销');
    assert(store.getSnapshot().sim.current === 'profile_form', '撤销后回到资料表单');
    clickButton('重做');
    assert(store.getSnapshot().sim.current === 'privacy_consent', '重做后再次到隐私授权');

    const raw = window.localStorage.getItem('onboard-trace-v1');
    assert(!!raw && raw.includes('"seq"'), '运行态已持久化到 localStorage');
    writeFileSync(STATE_FILE, raw);

    const parsed = JSON.parse(raw);
    assert(parsed.sim.status === 'running', '存档快照时状态为 running');
    console.log('--- drive 完成 ---');
  } else {
    const snap0 = store.getSnapshot();
    assert(snap0.sim.status === 'interrupted', '刷新恢复：running 被转成中断待恢复');
    assert(snap0.sim.events.some((e) => e.type === 'session_recovered'), '写入 session_recovered 事件');
    assert(pillText().includes('中断待恢复'), '界面显示中断待恢复');

    clickButton('恢复');
    assert(store.getSnapshot().sim.status === 'running', '恢复后继续运行');

    // 走完剩余：单步直到完成（个人配合型 CN 桌面）
    for (let i = 0; i < 12; i++) {
      if (store.getSnapshot().sim.status === 'completed') break;
      clickButton('单步');
    }
    assert(store.getSnapshot().sim.status === 'completed', '恢复后单步走到完成');
    assert(store.getSnapshot().history.length === 1, '完成后归档 1 条历史运行');

    window.confirm = () => true;
    G.confirm = () => true;
    clickButton('重置');
    assert(store.getSnapshot().sim.status === 'idle', '重置后回到未开始');
    assert(!window.localStorage.getItem('onboard-trace-v1'), '重置清空本地存档');
    console.log('--- resume 完成 ---');
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
