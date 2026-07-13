"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function CodeEditor() {
  const { source, setSource, highlightedSpan } = useCompilerStore();
  const [editor, setEditor] = useState<any>(null);
  const [monaco, setMonaco] = useState<any>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (!highlightedSpan) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }

    const start = model.getPositionAt(highlightedSpan.start);
    const end = model.getPositionAt(highlightedSpan.end);
    const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
            range,
            options: {
              isWholeLine: false,
          className: 'bg-teal-500/10 border-b border-teal-500/50',
          inlineClassName: 'bg-teal-500/10 border-b border-teal-500/50',
        },
      },
    ]);
    editor.revealRangeInCenterIfOutsideViewport(range);
  }, [editor, highlightedSpan, monaco]);

  return (
    <Editor
      height="100%"
      language="cpp"
      theme="vs"
      value={source}
      onChange={(value) => setSource(value ?? '')}
      onMount={(editorInstance, monacoInstance) => {
        setEditor(editorInstance);
        setMonaco(monacoInstance);
      }}
      options={{
        minimap: { enabled: false },
        fontSize: 15,
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        padding: { top: 22 },
        lineNumbersMinChars: 3,
        overviewRulerBorder: false,
        renderLineHighlight: 'all',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
