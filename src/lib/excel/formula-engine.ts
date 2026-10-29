// A constrained, safe recalculation engine for a small subset of Excel formulas
// commonly found in BOQs: arithmetic over numeric literals and same-sheet cell
// references, plus SUM(range). This deliberately does NOT evaluate arbitrary
// formulas or execute any code from the workbook — unsupported formulas are
// reported as "unavailable" rather than guessed at.

export interface CellLookup {
  (address: string): number | null;
}

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "ref"; value: string }
  | { type: "sum"; range: string }
  | { type: "comma" };

export class UnsupportedFormulaError extends Error {}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = formula.trim();

  const sumMatch = /^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/i.exec(src);
  if (sumMatch) {
    return [{ type: "sum", range: `${sumMatch[1]}:${sumMatch[2]}` }];
  }

  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "num", value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9$]/.test(src[j])) j++;
      const ref = src.slice(i, j).replace(/\$/g, "");
      if (!/^[A-Za-z]+\d+$/.test(ref)) {
        throw new UnsupportedFormulaError(`Unsupported reference or function: ${ref}`);
      }
      tokens.push({ type: "ref", value: ref.toUpperCase() });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new UnsupportedFormulaError(`Unsupported character "${c}" in formula`);
  }
  return tokens;
}

/**
 * Recursive-descent parser/evaluator for: literals, same-sheet cell refs,
 * +, -, *, /, parentheses, and SUM(range). Division by zero and missing
 * references throw UnsupportedFormulaError so the caller marks the result
 * "unavailable" rather than fabricating a number.
 */
export function evaluateFormula(formula: string, lookup: CellLookup): number {
  const cleaned = formula.replace(/^=/, "");
  const tokens = tokenize(cleaned);

  if (tokens.length === 1 && tokens[0].type === "sum") {
    const [start, end] = tokens[0].range.split(":");
    const cells = expandRange(start, end);
    let total = 0;
    for (const addr of cells) {
      const v = lookup(addr);
      if (v === null) throw new UnsupportedFormulaError(`Missing value for ${addr} in SUM range`);
      total += v;
    }
    return total;
  }

  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function consume() {
    return tokens[pos++];
  }

  function parseExpression(): number {
    let value = parseTerm();
    let tok = peek();
    while (tok && tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
      const op = (consume() as { type: "op"; value: "+" | "-" }).value;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
      tok = peek();
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    let tok = peek();
    while (tok && tok.type === "op" && (tok.value === "*" || tok.value === "/")) {
      const op = (consume() as { type: "op"; value: "*" | "/" }).value;
      const rhs = parseFactor();
      if (op === "/") {
        if (rhs === 0) throw new UnsupportedFormulaError("Division by zero");
        value = value / rhs;
      } else {
        value = value * rhs;
      }
      tok = peek();
    }
    return value;
  }

  function parseFactor(): number {
    const tok = peek();
    if (!tok) throw new UnsupportedFormulaError("Unexpected end of formula");
    if (tok.type === "num") {
      consume();
      return tok.value;
    }
    if (tok.type === "ref") {
      consume();
      const v = lookup(tok.value);
      if (v === null) throw new UnsupportedFormulaError(`Missing value for ${tok.value}`);
      return v;
    }
    if (tok.type === "lparen") {
      consume();
      const v = parseExpression();
      const close = consume();
      if (!close || close.type !== "rparen") throw new UnsupportedFormulaError("Unbalanced parentheses");
      return v;
    }
    if (tok.type === "op" && tok.value === "-") {
      consume();
      return -parseFactor();
    }
    throw new UnsupportedFormulaError(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new UnsupportedFormulaError("Trailing tokens in formula");
  return result;
}

function colToIndex(col: string): number {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return idx;
}
function indexToCol(idx: number): string {
  let s = "";
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

function expandRange(start: string, end: string): string[] {
  const m1 = /^([A-Za-z]+)(\d+)$/.exec(start)!;
  const m2 = /^([A-Za-z]+)(\d+)$/.exec(end)!;
  const c1 = colToIndex(m1[1]);
  const r1 = parseInt(m1[2], 10);
  const c2 = colToIndex(m2[1]);
  const r2 = parseInt(m2[2], 10);
  const addrs: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      addrs.push(`${indexToCol(c)}${r}`);
    }
  }
  return addrs;
}
