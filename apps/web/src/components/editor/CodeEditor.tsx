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
            { token: 'keyword', foreground: 'D9E1E7' },
            { token: 'number', foreground: 'AEBAC3' },
            { token: 'string', foreground: '9EABB5' },
            { token: 'comment', foreground: '65727C', fontStyle: 'italic' },
            { token: 'type', foreground: 'C5CFD6' },
          ],
          colors: {
            'editor.background': '#11151a',
            'editor.foreground': '#cbd3da',
            'editorLineNumber.foreground': '#4d5963',
            'editorLineNumber.activeForeground': '#8da2b1',
            'editor.lineHighlightBackground': '#171c22',
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': '#55788d55',
            'editor.inactiveSelectionBackground': '#55788d33',
            'editorCursor.foreground': '#78a6c2',
            'editorIndentGuide.background1': '#232b32',
            'editorIndentGuide.activeBackground1': '#3b4852',
            'scrollbar.shadow': '#00000000',
            'scrollbarSlider.background': '#39444d55',
            'scrollbarSlider.hoverBackground': '#52616d88',
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
        fontSize: 14,
        lineHeight: 22,
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
