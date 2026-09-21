import type { ConditionExpr, ConditionScope, Ctx, Op } from './types';

function compare(a: unknown, op: Op, b: unknown): boolean {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>':
      return Number(a) > Number(b);
    case '<':
      return Number(a) < Number(b);
    case '>=':
      return Number(a) >= Number(b);
    case '<=':
      return Number(a) <= Number(b);
  }
}

export function evalExpr(expr: ConditionExpr, scope: ConditionScope): boolean {
  if ('all' in expr) return expr.all.every((e) => evalExpr(e, scope));
  if ('any' in expr) return expr.any.some((e) => evalExpr(e, scope));
  if ('not' in expr) return !evalExpr(expr.not, scope);
  const bag: Ctx | string =
    expr.field === 'ctx' ? scope.ctx : expr.field === 'device' ? { v: scope.device } : { v: scope.region };
  const left = expr.field === 'ctx' ? scope.ctx[expr.key] : (bag as Ctx).v;
  return compare(left, expr.op, expr.value);
}

/** 人类可读的条件描述，直接展示在边与节点上，方便验收阅读 */
export function describeExpr(expr: ConditionExpr): string {
  if ('all' in expr) return expr.all.map(describeExpr).join(' 且 ');
  if ('any' in expr) return expr.any.map(describeExpr).join(' 或 ');
  if ('not' in expr) return `非(${describeExpr(expr.not)})`;
  const fieldName =
    expr.field === 'ctx'
      ? expr.key
      : expr.field === 'device'
        ? `设备=${expr.value}`
        : `地区=${expr.value}`;
  if (expr.field !== 'ctx') return fieldName;
  return `${expr.key} ${expr.op} ${JSON.stringify(expr.value)}`;
}
