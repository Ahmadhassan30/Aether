export interface ExampleProgram {
  id: string;
  title: string;
  summary: string;
  tag: string;
  source: string;
}

const fibSource = [
  'int fib(unsigned n) {',
  '    if (n < 2) return 1;',
  '    return fib(n - 2) + fib(n - 1);',
  '}',
  'int main(void) {',
  '    return fib(5);',
  '}',
  '',
].join('\n');

const boundsTrapSource = [
  'int values[] = {10, 20, 30};',
  'int main(void) {',
  '    return values[5];',
  '}',
  '',
].join('\n');

const cfgLoopSource = [
  'int main(void) {',
  '    int i = 0;',
  '    int sum = 0;',
  '    while (i < 4) {',
  '        for (int j = 0; j < 3; j += 1) {',
  '            if ((i + j) % 2 == 0) {',
  '                sum += i + j;',
  '            } else {',
  '                sum -= 1;',
  '            }',
  '        }',
  '        i += 1;',
  '    }',
  '    return sum;',
  '}',
  '',
].join('\n');

const structPointerSource = [
  'struct Cell {',
  '    int value;',
  '    struct Cell *next;',
  '} node;',
  'int main(void) {',
  '    node.value = 7;',
  '    node.next = &node;',
  '    node.next->value = 9;',
  '    return node.value;',
  '}',
  '',
].join('\n');

const consoleSource = [
  'int putchar(int c);',
  'int main(void) {',
  '    putchar(\'b\');',
  '    putchar(\'o\');',
  '    putchar(\'o\');',
  '    putchar(\'t\');',
  '    putchar(\'\\n\');',
  '    return 0;',
  '}',
  '',
].join('\n');

export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    id: 'console-stream',
    title: 'Console stream',
    summary: 'Three printf calls to prove step-by-step stdout streaming.',
    tag: 'Execution',
    source: consoleSource,
  },
  {
    id: 'recursive-fib',
    title: 'Recursive fib',
    summary: 'Classic recursion with visible call-stack growth.',
    tag: 'Recursion',
    source: fibSource,
  },
  {
    id: 'array-bounds-trap',
    title: 'Array bounds trap',
    summary: 'Provokes a structured OutOfBounds trap for the trap panel.',
    tag: 'Trap',
    source: boundsTrapSource,
  },
  {
    id: 'cfg-loop-gauntlet',
    title: 'CFG loop gauntlet',
    summary: 'Nested loops and branches that make the CFG worth inspecting.',
    tag: 'CFG',
    source: cfgLoopSource,
  },
  {
    id: 'struct-pointer-walk',
    title: 'Struct pointer walk',
    summary: 'A pointer-through-struct example that exercises member access.',
    tag: 'Pointers',
    source: structPointerSource,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLE_PROGRAMS[0];
