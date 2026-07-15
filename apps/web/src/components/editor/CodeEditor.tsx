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
            { token: 'keyword', foreground: '9FE870', fontStyle: 'bold' },
            { token: 'number', foreground: 'F59E0B' },
            { token: 'string', foreground: 'FFC091' },
            { token: 'comment', foreground: '727471', fontStyle: 'italic' },
            { token: 'type', foreground: '38C8FF' },
            { token: 'identifier', foreground: 'F7F5F0' },
            { token: 'delimiter', foreground: 'C084FC' },
            { token: 'operator', foreground: '38C8FF' },
          ],
          colors: {
            'editor.background': '#0e0f0c',
            'editor.foreground': '#f7f5f0',
            'editorLineNumber.foreground': '#3e3f3c',
            'editorLineNumber.activeForeground': '#9fe870',
            'editor.lineHighlightBackground': '#181916',
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': '#9fe87033',
            'editor.inactiveSelectionBackground': '#9fe87022',
            'editorCursor.foreground': '#9fe870',
            'editorIndentGuide.background1': '#2d2e2b',
            'editorIndentGuide.activeBackground1': '#3e3f3c',
            'scrollbar.shadow': '#00000000',
            'scrollbarSlider.background': '#2d2e2b55',
            'scrollbarSlider.hoverBackground': '#3e3f3c88',
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
