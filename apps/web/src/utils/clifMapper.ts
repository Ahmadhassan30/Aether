export function mapClifLineToSourceSpan(
  line: string,
  source: string,
  funcStart: number,
  funcEnd: number
): { start: number; end: number } | null {
  const cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith('function') || cleanLine.startsWith('block') || cleanLine === '}') {
    return null;
  }

  // Extract function-specific source slice
  const funcSource = source.substring(funcStart, funcEnd);

  // 1. Return instruction
  if (cleanLine.includes('return')) {
    const retIdx = funcSource.indexOf('return');
    if (retIdx !== -1) {
      const absStart = funcStart + retIdx;
      let absEnd = absStart;
      while (absEnd < source.length && source[absEnd] !== ';') {
        absEnd++;
      }
      return { start: absStart, end: absEnd + 1 };
    }
  }

  // 2. Constants (iconst, fconst)
  const constRegex = /(iconst|fconst)\.[a-z0-9]+\s+(-?[0-9\.]+)/;
  const constMatch = cleanLine.match(constRegex);
  if (constMatch) {
    const val = constMatch[2];
    const valIdx = funcSource.indexOf(val);
    if (valIdx !== -1) {
      return { start: funcStart + valIdx, end: funcStart + valIdx + val.length };
    }
  }

  // 3. Comparisons (icmp, fcmp)
  if (cleanLine.includes('icmp') || cleanLine.includes('fcmp')) {
    const compOperators = ['<=', '>=', '==', '!=', '<', '>'];
    for (const op of compOperators) {
      const opIdx = funcSource.indexOf(op);
      if (opIdx !== -1) {
        return { start: funcStart + opIdx, end: funcStart + opIdx + op.length };
      }
    }
  }

  // 4. Function Calls
  if (cleanLine.includes('call')) {
    const callIdx = funcSource.indexOf('(');
    if (callIdx !== -1) {
      let nameStart = callIdx - 1;
      while (nameStart > 0 && /[a-zA-Z0-9_]/.test(funcSource[nameStart])) {
        nameStart--;
      }
      return { start: funcStart + nameStart + 1, end: funcStart + callIdx };
    }
  }

  // 5. Binary arithmetic operations
  const binaryOps = [
    { clif: 'iadd', op: '+' },
    { clif: 'isub', op: '-' },
    { clif: 'imul', op: '*' },
    { clif: 'sdiv', op: '/' },
  ];
  for (const item of binaryOps) {
    if (cleanLine.includes(item.clif)) {
      const opIdx = funcSource.indexOf(item.op);
      if (opIdx !== -1) {
        return { start: funcStart + opIdx, end: funcStart + opIdx + 1 };
      }
    }
  }

  // Fallback: highlight the whole function block
  return { start: funcStart, end: funcEnd };
}
