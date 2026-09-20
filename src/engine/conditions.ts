import type { EvalCtx } from './types'

/**
 * 极小安全表达式求值器：支持 && || ! == != > >= < <=，括号，
 * 标识符（布尔/字符串/数字/null）、字符串字面量、数字字面量、true/false/null。
 * 不使用 eval/Function，避免注入。
 *
 * 示例：region == "eu" && ageVerified
 *       cookiesAccepted != null
 *       accountType == "business" || plan == "pro"
 */

type Token =
  | { kind: 'id'; value: string }
  | { kind: 'str'; value: string }
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'punc'; value: '(' | ')' }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]!
    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let out = ''
      while (j < expr.length && expr[j] !== quote) {
        out += expr[j]
        j++
      }
      if (j >= expr.length) throw new Error(`表达式缺少结束引号: ${expr}`)
      tokens.push({ kind: 'str', value: out })
      i = j + 1
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i
      let n = ''
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) {
        n += expr[j]
        j++
      }
      tokens.push({ kind: 'num', value: Number(n) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      let id = ''
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j]!)) {
        id += expr[j]
        j++
      }
      tokens.push({ kind: 'id', value: id })
      i = j
      continue
    }
    const two = expr.slice(i, i + 2)
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ kind: 'op', value: two })
      i += 2
      continue
    }
    if (['!', '>', '<'].includes(c)) {
      tokens.push({ kind: 'op', value: c })
      i++
      continue
    }
    if (c === '(' || c === ')') {
      tokens.push({ kind: 'punc', value: c })
      i++
      continue
    }
    throw new Error(`表达式含无法识别的字符 "${c}": ${expr}`)
  }
  return tokens
}

// 递归下降：Or < And < Equality < Comparison < Unary < Primary
class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): (flags: EvalCtx) => unknown {
    const fn = this.parseOr()
    if (this.pos < this.tokens.length) {
      throw new Error('表达式存在多余 token')
    }
    return fn
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private parseOr(): (flags: EvalCtx) => unknown {
    let left = this.parseAnd()
    while (this.peek()?.kind === 'op' && this.peek()?.value === '||') {
      this.pos++
      const right = this.parseAnd()
      const l = left
      left = (f) => Boolean(l(f)) || Boolean(right(f))
    }
    return left
  }

  private parseAnd(): (flags: EvalCtx) => unknown {
    let left = this.parseEquality()
    while (this.peek()?.kind === 'op' && this.peek()?.value === '&&') {
      this.pos++
      const right = this.parseEquality()
      const l = left
      left = (f) => Boolean(l(f)) && Boolean(right(f))
    }
    return left
  }

  private parseEquality(): (flags: EvalCtx) => unknown {
    let left = this.parseComparison()
    while (true) {
      const t = this.peek()
      if (t?.kind === 'op' && (t.value === '==' || t.value === '!=')) {
        this.pos++
        const right = this.parseComparison()
        const l = left
        const op = t.value
        left = (f) => (op === '==' ? l(f) === right(f) : l(f) !== right(f))
      } else break
    }
    return left
  }

  private parseComparison(): (flags: EvalCtx) => unknown {
    let left = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (t?.kind === 'op' && ['>', '>=', '<', '<='].includes(t.value)) {
        this.pos++
        const right = this.parseUnary()
        const l = left
        const op = t.value
        left = (f) => {
          const a = l(f)
          const b = right(f)
          if (op === '>') return (a as number) > (b as number)
          if (op === '>=') return (a as number) >= (b as number)
          if (op === '<') return (a as number) < (b as number)
          return (a as number) <= (b as number)
        }
      } else break
    }
    return left
  }

  private parseUnary(): (flags: EvalCtx) => unknown {
    const t = this.peek()
    if (t?.kind === 'op' && t.value === '!') {
      this.pos++
      const inner = this.parseUnary()
      return (f) => !Boolean(inner(f))
    }
    return this.parsePrimary()
  }

  private parsePrimary(): (flags: EvalCtx) => unknown {
    const t = this.tokens[this.pos]
    if (!t) throw new Error('表达式意外结束')
    if (t.kind === 'punc' && t.value === '(') {
      this.pos++
      const inner = this.parseOr()
      const close = this.tokens[this.pos]
      if (close?.kind !== 'punc' || close.value !== ')') {
        throw new Error('表达式缺少右括号')
      }
      this.pos++
      return inner
    }
    if (t.kind === 'str') {
      this.pos++
      return () => t.value
    }
    if (t.kind === 'num') {
      this.pos++
      return () => t.value
    }
    if (t.kind === 'id') {
      this.pos++
      if (t.value === 'true') return () => true
      if (t.value === 'false') return () => false
      if (t.value === 'null') return () => null
      const key = t.value
      return (flags) => {
        if (!(key in flags)) throw new Error(`条件引用了未知字段: ${key}`)
        return flags[key as keyof EvalCtx]
      }
    }
    throw new Error(`表达式中出现意外 token: ${JSON.stringify(t)}`)
  }
}

const cache = new Map<string, (flags: EvalCtx) => unknown>()

export function compileExpr(expr: string): (flags: EvalCtx) => unknown {
  const hit = cache.get(expr)
  if (hit) return hit
  const fn = new Parser(tokenize(expr)).parse()
  cache.set(expr, fn)
  return fn
}

export function evalCondition(expr: string | undefined, flags: EvalCtx): boolean {
  if (!expr || !expr.trim()) return true
  return Boolean(compileExpr(expr)(flags))
}

/** 人类可读的条件解释（日志里展示） */
export function describeCondition(expr: string | undefined): string {
  return expr && expr.trim() ? expr : '无条件'
}
