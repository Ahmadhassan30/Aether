import { TreeNode } from '../components/TreeView';

export function parseAstOrHirToTree(
  text: string,
  start: number,
  end: number,
  isHir: boolean
): TreeNode {
  const lines = text.split('\n');
  const root: TreeNode = {
    id: `root-${start}`,
    label: '',
    children: [],
    start,
    end,
  };

  const stack: TreeNode[] = [root];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check block boundaries
    let isClose = trimmed.startsWith('}');
    if (isClose) {
      if (stack.length > 1) {
        stack.pop();
      }
      if (!trimmed.includes('{')) {
        continue;
      }
    }

    const isOpen = trimmed.endsWith('{') || trimmed.includes('{');

    let label = trimmed;
    if (isOpen) {
      label = label.substring(0, label.indexOf('{')).trim();
    }
    if (isClose) {
      const idx = label.indexOf('}');
      label = label.substring(idx + 1).trim();
    }

    if (!label && isOpen) {
      label = 'Block';
    }

    if (!label) {
      continue;
    }

    // Extract type annotations for HIR
    let typeInfo: string | undefined = undefined;
    if (isHir) {
      // Look for casting notation e.g., (int)(...) or (long)(...) or (char)(...)
      // Matches standard primitive casts at the beginning of statements/expressions
      const castRegex = /^\((int|long|char|void|float|double|double\s*\*|int\s*\*|char\s*\*)\)\s*\((.*)\);?$/;
      const castMatch = label.match(castRegex);
      if (castMatch) {
        typeInfo = castMatch[1];
        label = castMatch[2];
        if (!label.endsWith(';')) {
          label += ';';
        }
      } else {
        // Fallback: look for any explicit casts like (int)(x) anywhere in the line
        const inlineCastRegex = /\((int|long|char|void|float|double)\)/;
        const inlineMatch = label.match(inlineCastRegex);
        if (inlineMatch) {
          typeInfo = inlineMatch[1];
        }
      }

      // Check if it's a function declaration e.g. "extern int fibonacci(int n)"
      const funcDeclRegex = /^(extern\s+)?([a-zA-Z_][a-zA-Z0-9_]*\s*\*?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\(.*\)$/;
      const funcMatch = label.match(funcDeclRegex);
      if (funcMatch) {
        typeInfo = funcMatch[2].trim();
      }

      // Check if it's a variable declaration return value or type assignment
      const varDeclRegex = /^([a-zA-Z_][a-zA-Z0-9_]*\s*\*?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/;
      const varMatch = label.match(varDeclRegex);
      if (varMatch) {
        typeInfo = varMatch[1].trim();
      }
    }

    const node: TreeNode = {
      id: `node-${start}-${i}`,
      label,
      typeInfo,
      children: [],
      start,
      end,
    };

    const parent = stack[stack.length - 1];
    parent.children.push(node);

    if (isOpen) {
      stack.push(node);
    }
  }

  if (root.children.length === 1) {
    return root.children[0];
  }

  root.label = isHir ? 'HIR Declarations' : 'AST Declarations';
  return root;
}
