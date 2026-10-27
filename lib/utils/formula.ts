/**
 * Small, dependency-free formula evaluator for dynamic-module fields and table
 * columns (`formula_expression`).
 *
 * Why not `eval`: builders are admin-authored but the expression still arrives
 * over HTTP, so it is parsed here — arithmetic only (`+ - * / ^ %`), parentheses,
 * numeric literals, identifiers (other field/column keys) and a fixed set of
 * functions. Anything else throws `FormulaError`, which the service layer turns
 * into a 422 with the offending expression.
 *
 * Grammar (recursive descent):
 *   expr    := term (('+' | '-') term)*
 *   term    := power (('*' | '/' | '%') power)*
 *   power   := unary ('^' power)?
 *   unary   := ('-' | '+') unary | primary
 *   primary := number | identifier | identifier '(' args ')' | '(' expr ')'
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Token = { type: 'number'; value: number } | { type: 'ident'; value: string } | { type: 'op'; value: string };

const FUNCTIONS: Record<string, { arity: number | 'variadic'; fn: (args: number[]) => number }> = {
  SUM: { arity: 'variadic', fn: (a) => a.reduce((x, y) => x + y, 0) },
  AVG: { arity: 'variadic', fn: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0) },
  MIN: { arity: 'variadic', fn: (a) => (a.length ? Math.min(...a) : 0) },
  MAX: { arity: 'variadic', fn: (a) => (a.length ? Math.max(...a) : 0) },
  ABS: { arity: 1, fn: ([a]) => Math.abs(a) },
  ROUND: { arity: 2, fn: ([a, b]) => Number(a.toFixed(Math.max(Math.min(Math.trunc(b), 6), 0))) },
  FLOOR: { arity: 1, fn: ([a]) => Math.floor(a) },
  CEIL: { arity: 1, fn: ([a]) => Math.ceil(a) },
  PERCENT: { arity: 2, fn: ([a, b]) => (b === 0 ? 0 : (a / b) * 100) },
  IF: { arity: 3, fn: ([cond, a, b]) => (cond ? a : b) },
  COUNT: { arity: 'variadic', fn: (a) => a.filter((v) => Number.isFinite(v)).length },
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        num += expression[i];
        i += 1;
      }
      const value = Number(num);
      if (!Number.isFinite(value)) throw new FormulaError(`Invalid number "${num}"`);
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let ident = '';
      while (i < expression.length && /[A-Za-z0-9_.]/.test(expression[i])) {
        ident += expression[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    if ('+-*/^%(),<>='.includes(ch)) {
      // Two-character comparisons are accepted so IF(a > b, x, y) reads naturally.
      const two = expression.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

export type FormulaContext = Record<string, number | string | null | undefined>;

function toNumber(value: number | string | null | undefined, key: string): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(num)) throw new FormulaError(`"${key}" is not a number`);
  return num;
}

/** Compiles an expression once and reuses it — the builder previews formulas on every keystroke. */
export function compileFormula(expression: string): (context: FormulaContext) => number {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (value?: string) => {
    const token = tokens[pos];
    if (!token) throw new FormulaError('Unexpected end of expression');
    if (value && !(token.type === 'op' && token.value === value)) {
      throw new FormulaError(`Expected "${value}"`);
    }
    pos += 1;
    return token;
  };

  const parseExpr = (context: FormulaContext): number => {
    let left = parseTerm(context);
    for (;;) {
      const token = peek();
      if (token && token.type === 'op' && (token.value === '+' || token.value === '-')) {
        eat();
        const right = parseTerm(context);
        left = token.value === '+' ? left + right : left - right;
      } else break;
    }
    return left;
  };

  const parseTerm = (context: FormulaContext): number => {
    let left = parsePower(context);
    for (;;) {
      const token = peek();
      if (token && token.type === 'op' && (token.value === '*' || token.value === '/' || token.value === '%')) {
        eat();
        const right = parsePower(context);
        if (token.value === '*') left *= right;
        else if (token.value === '/') {
          if (right === 0) throw new FormulaError('Division by zero');
          left /= right;
        } else {
          if (right === 0) throw new FormulaError('Division by zero');
          left %= right;
        }
      } else break;
    }
    return left;
  };

  const parsePower = (context: FormulaContext): number => {
    const base = parseUnary(context);
    const token = peek();
    if (token && token.type === 'op' && token.value === '^') {
      eat();
      return base ** parsePower(context);
    }
    return base;
  };

  const parseUnary = (context: FormulaContext): number => {
    const token = peek();
    if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
      eat();
      const value = parseUnary(context);
      return token.value === '-' ? -value : value;
    }
    return parsePrimary(context);
  };

  const parseComparison = (context: FormulaContext): number => {
    let left = parseExpr(context);
    const token = peek();
    if (token && token.type === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(token.value)) {
      eat();
      const right = parseExpr(context);
      const truth = token.value === '>' ? left > right
        : token.value === '<' ? left < right
          : token.value === '>=' ? left >= right
            : token.value === '<=' ? left <= right
              : token.value === '==' ? left === right
                : left !== right;
      left = truth ? 1 : 0;
    }
    return left;
  };

  const parsePrimary = (context: FormulaContext): number => {
    const token = peek();
    if (!token) throw new FormulaError('Unexpected end of expression');
    if (token.type === 'number') {
      eat();
      return token.value;
    }
    if (token.type === 'op' && token.value === '(') {
      eat('(');
      const value = parseComparison(context);
      eat(')');
      return value;
    }
    if (token.type === 'ident') {
      eat();
      const name = token.value;
      const next = peek();
      if (next && next.type === 'op' && next.value === '(') {
        eat('(');
        const args: number[] = [];
        if (!(peek() && peek().type === 'op' && peek()!.value === ')')) {
          args.push(parseComparison(context));
          while (peek() && peek().type === 'op' && peek()!.value === ',') {
            eat(',');
            args.push(parseComparison(context));
          }
        }
        eat(')');
        const fn = FUNCTIONS[name.toUpperCase()];
        if (!fn) throw new FormulaError(`Unknown function "${name}"`);
        if (fn.arity !== 'variadic' && args.length !== fn.arity) {
          throw new FormulaError(`${name.toUpperCase()}() takes ${fn.arity} argument(s)`);
        }
        return fn.fn(args);
      }
      return toNumber(context[name], name);
    }
    throw new FormulaError('Unexpected token in expression');
  };

  return (context: FormulaContext) => {
    pos = 0;
    const value = parseComparison(context);
    if (pos < tokens.length) throw new FormulaError(`Unexpected "${tokens[pos].value}" after the expression`);
    if (!Number.isFinite(value)) throw new FormulaError('Expression did not evaluate to a number');
    return value;
  };
}

/** Evaluates `expression` against `context`; returns null when the formula is invalid. */
export function evaluateFormula(expression: string, context: FormulaContext): number | null {
  try {
    return compileFormula(expression)(context);
  } catch {
    return null;
  }
}

/** Identifiers referenced by an expression (used to warn about unknown keys). */
export function formulaIdentifiers(expression: string): string[] {
  const found = new Set<string>();
  let lastWasIdent = false;
  for (const match of expression.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
    const name = match[0];
    const after = expression.slice(match.index! + name.length).trimStart();
    const isFunction = after.startsWith('(') && FORMULA_FUNCTIONS.includes(name.toUpperCase());
    if (!isFunction) found.add(name);
    lastWasIdent = lastWasIdent || isFunction;
  }
  return [...found];
}
