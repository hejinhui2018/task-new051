let counter = 0;

/** 生成页面唯一 id（时间戳 + 进程内计数，无需额外依赖） */
export function uid(prefix = 'p'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
