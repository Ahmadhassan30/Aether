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
          className: 'bg-sky-400/10 border-b border-sky-300/55',
          inlineClassName: 'bg-sky-400/10 border-b border-sky-300/55',
        },
      },
    ]);
    editor.revealRangeInCenterIfOutsideViewport(range);
  }, [editor, highlightedSpan, monaco]);

  return (
    <Editor
      height="100%"
      language="cpp"
      theme="vs-dark"
      value={source}
      onChange={(value) => setSource(value ?? '')}
      onMount={(editorInstance, monacoInstance) => {
        monacoInstance.editor.defineTheme('aether-warp', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword', foreground: '9DB9F2' },
            { token: 'number', foreground: 'C7A6E8' },
            { token: 'string', foreground: 'A9C591' },
            { token: 'comment', foreground: '77716A', fontStyle: 'italic' },
            { token: 'type', foreground: 'D7C79D' },
          ],
          colors: {
            'editor.background': '#1f1d1b',
            'editor.foreground': '#d9d2c8',
            'editorLineNumber.foreground': '#5d5852',
            'editorLineNumber.activeForeground': '#aaa198',
            'editor.lineHighlightBackground': '#2b28250f',
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': '#526f9e55',
            'editor.inactiveSelectionBackground': '#526f9e33',
            'editorCursor.foreground': '#d9d2c8',
            'editorIndentGuide.background1': '#35312e',
            'editorIndentGuide.activeBackground1': '#514b45',
            'scrollbar.shadow': '#00000000',
            'scrollbarSlider.background': '#625d5738',
            'scrollbarSlider.hoverBackground': '#77716a66',
          },
        });
        monacoInstance.editor.setTheme('aether-warp');
        setEditor(editorInstance);
        setMonaco(monacoInstance);
      }}
      options={{
        readOnly: false,
        domReadOnly: false,
        minimap: { enabled: false },
        fontSize: 12,
        lineHeight: 20,
        fontFamily: 'var(--font-geist-mono), Geist Mono, monospace',
        padding: { top: 12 },
        lineNumbersMinChars: 3,
        overviewRulerBorder: false,
        renderLineHighlight: 'all',
        scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        insertSpaces: true,
        tabSize: 4,
        detectIndentation: false,
        tabFocusMode: false,
        accessibilitySupport: 'auto',
        automaticLayout: true,
      }}
    />
  );
}
