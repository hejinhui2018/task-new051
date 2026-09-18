// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';

describe('App 冒烟渲染', () => {
  it('首屏渲染内置 16 页手册的拼版台（无 localStorage 时回退示例）', () => {
    const html = renderToString(<App />);
    expect(html).toContain('骑马钉拼版台');
    // 16 页 = 4 帖：最外帖 + 向内第 2/3/4 层
    expect(html).toContain('最外帖');
    expect(html).toContain('由外向内第 4 层');
    expect(html).not.toContain('由外向内第 5 层');
    // 出血不足示例（封面/封底 2mm）会在首屏即被诊断
    expect(html).toContain('版面错误');
    expect(html).toContain('折叠预演');
  });
});
