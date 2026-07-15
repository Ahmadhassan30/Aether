"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

interface Token {
  id: string;
  kind: string;
  text: string;
  span: {
    start: number;
    end: number;
  };
}

function getTokenTheme(kind: string): { bg: string; border: string; text: string } {
  switch (kind) {
    case 'keyword':
      return {
        bg: 'rgba(159, 232, 112, 0.08)',
        border: '#9fe870',
        text: '#9fe870',
      };
    case 'identifier':
      return {
        bg: 'rgba(247, 245, 240, 0.04)',
        border: 'rgba(255, 255, 255, 0.2)',
        text: '#f7f5f0',
      };
    case 'integer':
      return {
        bg: 'rgba(245, 158, 11, 0.08)',
        border: '#f59e0b',
        text: '#f59e0b',
      };
    case 'operator':
      return {
        bg: 'rgba(56, 200, 255, 0.08)',
        border: '#38c8ff',
        text: '#38c8ff',
      };
    default:
      return {
        bg: 'rgba(192, 132, 252, 0.05)',
        border: 'rgba(192, 132, 252, 0.4)',
        text: '#c084fc',
      };
  }
}

function getKindLabelTheme(kind: string): string {
  switch (kind) {
    case 'keyword': return '#9fe870';
    case 'identifier': return '#f7f5f0';
    case 'integer': return '#f59e0b';
    case 'operator': return '#38c8ff';
    default: return '#c084fc';
  }
}

export default function TokenViewer() {
  const { source, artifacts, setHighlightedSpan } = useCompilerStore();
  const tokens = (artifacts?.tokens ?? []) as Token[];

  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);

  const activeToken = useMemo(() => {
    return tokens.find((t) => t.id === (hoveredTokenId || selectedTokenId)) || null;
  }, [tokens, hoveredTokenId, selectedTokenId]);

  // Compute character index boundaries for lines to group tokens by source line
  const lineStarts = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') starts.push(i + 1);
    }
    return starts;
  }, [source]);

  const getLineIndex = useCallback((index: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) {
        if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > index) {
          return mid;
        }
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return 0;
  }, [lineStarts]);

  // Group equivalent indentation spaces per line to match code shape
  const lineIndents = useMemo(() => {
    const lines = source.split('\n');
    return lines.map((line) => {
      const match = line.match(/^(\s*)/);
      const ws = match ? match[0] : '';
      let spaces = 0;
      for (let i = 0; i < ws.length; i++) {
        spaces += ws[i] === '\t' ? 4 : 1;
      }
      return spaces;
    });
  }, [source]);

  // Group tokens into line-by-line arrays
  const tokenLines = useMemo(() => {
    const linesCount = source.split('\n').length;
    const lines: Token[][] = Array.from({ length: linesCount }, () => []);
    tokens.forEach((token) => {
      const lineIdx = getLineIndex(token.span.start);
      if (lineIdx >= 0 && lineIdx < linesCount) {
        lines[lineIdx].push(token);
      }
    });
    return lines;
  }, [tokens, source, getLineIndex]);

  // Lexer metrics
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    tokens.forEach((t) => {
      counts[t.kind] = (counts[t.kind] || 0) + 1;
    });
    return {
      total: tokens.length,
      counts,
    };
  }, [tokens]);

  return (
    <div className="flex h-full w-full bg-[var(--workspace)] overflow-hidden font-sans">
      {/* 1. Left Section: Styled structured token stream */}
      <div className="flex-1 overflow-y-auto p-6 border-r border-[var(--hairline)] scrollbar-thin">
        <div className="flex flex-col gap-3 font-mono text-[14px]">
          {tokenLines.map((lineTokens, lineIdx) => {
            const isEmpty = lineTokens.length === 0;
            return (
              <div key={lineIdx} className="flex items-center min-h-[36px] group">
                {/* Line count gutter */}
                <div className="w-10 shrink-0 text-right pr-4 text-[12px] font-bold text-[var(--muted)] border-r border-[var(--hairline)] select-none">
                  {lineIdx + 1}
                </div>

                {/* Indentation alignment spacer */}
                {lineIndents[lineIdx] > 0 && (
                  <div 
                    style={{ width: `${lineIndents[lineIdx] * 9}px` }} 
                    className="shrink-0 h-4 border-b border-dashed border-[var(--hairline)] opacity-20 mr-2"
                  />
                )}

                {/* Row tokens grid */}
                <div className="flex flex-wrap gap-2 items-center pl-4">
                  {isEmpty ? (
                    <span className="text-white/5 italic text-[11px] select-none">empty line</span>
                  ) : (
                    lineTokens.map((token) => {
                      const isHovered = hoveredTokenId === token.id;
                      const isSelected = selectedTokenId === token.id;
                      const theme = getTokenTheme(token.kind);

                      return (
                        <button
                          key={token.id}
                          onMouseEnter={() => {
                            setHighlightedSpan(token.span);
                            setHoveredTokenId(token.id);
                          }}
                          onMouseLeave={() => {
                            setHighlightedSpan(null);
                            setHoveredTokenId(null);
                          }}
                          onClick={() => setSelectedTokenId(isSelected ? null : token.id)}
                          style={{
                            backgroundColor: theme.bg,
                            border: isSelected || isHovered ? `2px solid ${theme.border}` : `1.5px solid ${theme.border}80`,
                            color: theme.text,
                            boxShadow: isSelected || isHovered ? `0 0 12px ${theme.border}30` : 'none',
                          }}
                          className="px-3 py-1 rounded-[24px] font-mono font-semibold text-[13px] transition-all duration-150 transform hover:scale-[1.03] active:scale-[0.97]"
                        >
                          {token.text || <span className="opacity-45 italic">{token.kind}</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Right Section: Details Inspector card & Breakdown stats */}
      <aside className="w-[300px] shrink-0 bg-[rgba(18,19,17,0.35)] backdrop-blur-md p-6 flex flex-col gap-6 overflow-y-auto border-l border-[var(--hairline)]">
        <div className="border-b border-[var(--hairline)] pb-4">
          <h2 className="text-[16px] font-bold tracking-tight text-[var(--ink)]">Lexical Analyzer</h2>
          <p className="text-[11px] text-[var(--muted)] font-mono mt-1">Stage 03 · Tokens list</p>
        </div>

        {activeToken ? (
          /* Inspect card */
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Token Inspector</h3>
            
            <div 
              style={{
                backgroundColor: getTokenTheme(activeToken.kind).bg,
                border: `2px solid ${getTokenTheme(activeToken.kind).border}`,
              }}
              className="p-5 rounded-[12px] flex flex-col justify-between min-h-[140px] shadow-lg"
            >
              <span 
                className="font-mono text-[11px] font-[900] uppercase tracking-wider opacity-65"
                style={{ color: getTokenTheme(activeToken.kind).text }}
              >
                {activeToken.kind}
              </span>
              <div 
                className="font-mono text-[24px] font-[900] leading-snug break-words my-2"
                style={{ color: getTokenTheme(activeToken.kind).text }}
              >
                {activeToken.text || <span className="opacity-45 italic">{activeToken.kind}</span>}
              </div>
              <div 
                className="mt-auto border-t border-white/10 pt-2 flex items-center justify-between text-[11px] font-bold opacity-60 font-mono"
                style={{ color: getTokenTheme(activeToken.kind).text }}
              >
                <span>ID: {activeToken.id}</span>
                <span>Span: {activeToken.span.start}–{activeToken.span.end}</span>
              </div>
            </div>

            <div className="bg-[var(--panel)] border border-[var(--hairline)] rounded-[12px] p-4 flex flex-col gap-2 font-mono text-[12px]">
              <div className="flex justify-between py-1 border-b border-[var(--hairline)]">
                <span className="text-[var(--muted)]">Classification</span>
                <span className="font-bold text-[var(--ink)] capitalize">{activeToken.kind}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--hairline)]">
                <span className="text-[var(--muted)]">Start Offset</span>
                <span className="font-bold text-[var(--ink)]">{activeToken.span.start} char</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--muted)]">End Offset</span>
                <span className="font-bold text-[var(--ink)]">{activeToken.span.end} char</span>
              </div>
            </div>
          </div>
        ) : (
          /* General counts stats */
          <div className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Lexical Statistics</h3>
            
            <div className="bg-[var(--panel)] border border-[var(--hairline)] rounded-[12px] p-4 flex flex-col gap-3 font-mono text-[13px]">
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--muted)]">Total Tokens</span>
                <span className="text-[20px] font-black text-[var(--signal)]">{stats.total}</span>
              </div>
              
              <div className="border-t border-[var(--hairline)] pt-3 flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase text-[var(--muted)] tracking-wider">Breakdown</span>
                {Object.entries(stats.counts).map(([kind, count]) => {
                  const labelThemeColor = getKindLabelTheme(kind);
                  return (
                    <div key={kind} className="flex justify-between items-center text-[12px] py-0.5">
                      <span className="capitalize" style={{ color: labelThemeColor }}>{kind}</span>
                      <span className="font-bold text-[var(--ink)]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="text-[11px] text-[var(--muted)] leading-relaxed italic bg-[var(--canvas-soft)] border border-[var(--hairline)] rounded-[8px] p-3">
              💡 Hover over any token chip to highlight its source location in the code editor, or click to lock its detail inspection.
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
