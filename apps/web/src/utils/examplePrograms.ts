export interface ExampleProgram {
  id: string;
  title: string;
  summary: string;
  tag: string;
  source: string;
}

const basicArithmeticSource = [
  'int main(void) {',
  '    int a = 7;',
  '    int b = 3;',
  '    int value = a * b;',
  '    value = value + 10;',
  '    value = value - b;',
  '    return value / 2;',
  '}',
  '',
].join('\n');

const branchingSource = [
  'int classify(int score) {',
  '    if (score >= 90) {',
  '        return 3;',
  '    }',
  '    if (score >= 70) {',
  '        return 2;',
  '    }',
  '    if (score >= 50) {',
  '        return 1;',
  '    }',
  '    return 0;',
  '}',
  '',
  'int main(void) {',
  '    return classify(76);',
  '}',
  '',
].join('\n');

const loopSource = [
  'int main(void) {',
  '    int i = 0;',
  '    int sum = 0;',
  '    while (i < 5) {',
  '        sum = sum + i;',
  '        i = i + 1;',
  '    }',
  '',
  '    for (int j = 0; j < 4; j = j + 1) {',
  '        sum = sum + j;',
  '    }',
  '',
  '    return sum;',
  '}',
  '',
].join('\n');

const functionSource = [
  'int square(int n) {',
  '    return n * n;',
  '}',
  '',
  'int cube(int n) {',
  '    return n * n * n;',
  '}',
  '',
  'int main(void) {',
  '    int a = square(4);',
  '    int b = cube(3);',
  '    return a + b;',
  '}',
  '',
].join('\n');

const recursionSource = [
  'int fib(unsigned n) {',
  '    if (n < 2) {',
  '        return 1;',
  '    }',
  '    return fib(n - 2) + fib(n - 1);',
  '}',
  '',
  'int main(void) {',
  '    return fib(5);',
  '}',
  '',
].join('\n');

const arraySource = [
  'int values[] = {1, 2, 3, 4};',
  '',
  'int main(void) {',
  '    int i = 0;',
  '    int total = 0;',
  '    while (i < 4) {',
  '        total = total + values[i];',
  '        i = i + 1;',
  '    }',
  '    return total;',
  '}',
  '',
].join('\n');

const structSource = [
  'struct Pair {',
  '    int left;',
  '    int right;',
  '} pair;',
  '',
  'int main(void) {',
  '    pair.left = 10;',
  '    pair.right = 32;',
  '    return pair.left + pair.right;',
  '}',
  '',
].join('\n');

const pointerSource = [
  'struct Cell {',
  '    int value;',
  '    struct Cell *next;',
  '} node;',
  '',
  'int main(void) {',
  '    node.value = 7;',
  '    node.next = &node;',
  '    node.next->value = 12;',
  '    return node.value;',
  '}',
  '',
].join('\n');

const controlFlowSource = [
  'int main(void) {',
  '    int i = 0;',
  '    int sum = 0;',
  '',
  '    while (i < 4) {',
  '        for (int j = 0; j < 3; j = j + 1) {',
  '            if ((i + j) % 2 == 0) {',
  '                sum = sum + i + j;',
  '            } else {',
  '                sum = sum - 1;',
  '            }',
  '        }',
  '        i = i + 1;',
  '    }',
  '',
  '    return sum;',
  '}',
  '',
].join('\n');

const outputSource = [
  'void print_int(int val);',
  'void putchar(int c);',
  '',
  'int main(void) {',
  '    print_int(42);',
  '    putchar(10);',
  '    print_int(99);',
  '    putchar(10);',
  '    return 0;',
  '}',
  '',
].join('\n');

const trapSource = [
  'int values[] = {10, 20, 30};',
  '',
  'int main(void) {',
  '    return values[5];',
  '}',
  '',
].join('\n');

export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    id: 'basic-arithmetic',
    title: 'Basic Arithmetic',
    summary: 'Integer variables, arithmetic operators, assignment, and return values.',
    tag: 'Basics',
    source: basicArithmeticSource,
  },
  {
    id: 'branching',
    title: 'Branching',
    summary: 'Multiple conditional paths with early returns.',
    tag: 'Control',
    source: branchingSource,
  },
  {
    id: 'loops',
    title: 'Loops',
    summary: 'While and for loops in one compact example.',
    tag: 'Control',
    source: loopSource,
  },
  {
    id: 'functions',
    title: 'Functions',
    summary: 'Function definitions, calls, parameters, and return values.',
    tag: 'Functions',
    source: functionSource,
  },
  {
    id: 'recursion',
    title: 'Recursion',
    summary: 'Recursive function calls with visible stack growth.',
    tag: 'Functions',
    source: recursionSource,
  },
  {
    id: 'arrays',
    title: 'Arrays',
    summary: 'Global array initialization, indexing, loops, and accumulation.',
    tag: 'Memory',
    source: arraySource,
  },
  {
    id: 'structs',
    title: 'Structs',
    summary: 'Struct declarations, global storage, field writes, and field reads.',
    tag: 'Memory',
    source: structSource,
  },
  {
    id: 'pointers',
    title: 'Pointers',
    summary: 'Address-of, struct pointers, arrow access, and indirect field writes.',
    tag: 'Memory',
    source: pointerSource,
  },
  {
    id: 'control-flow',
    title: 'Control Flow',
    summary: 'Nested loops, modulo, conditionals, and CFG-friendly branches.',
    tag: 'CFG',
    source: controlFlowSource,
  },
  {
    id: 'output',
    title: 'Output',
    summary: 'Built-in output declarations and stdout printing.',
    tag: 'Runtime',
    source: outputSource,
  },
  {
    id: 'runtime-trap',
    title: 'Runtime Trap',
    summary: 'An out-of-bounds access that demonstrates structured VM traps.',
    tag: 'Runtime',
    source: trapSource,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLE_PROGRAMS[0];
