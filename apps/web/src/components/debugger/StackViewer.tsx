"use client";

import React, { useMemo } from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

// Custom lightweight scale functions
function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (value: number) => {
    if (d1 === d0) return r0;
    return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
  };
}

function scaleBand(domain: number[], range: [number, number], padding = 0) {
  const [r0, r1] = range;
  const count = domain.length;
  const totalWidth = r1 - r0;
  const step = count > 0 ? totalWidth / count : totalWidth;
  const bandwidth = Math.max(1, step * (1 - padding));
  return {
    bandwidth,
    x: (index: number) => r0 + index * step + (step * padding) / 2
  };
}

export default function StackViewer() {
  const snapshot = useCompilerStore((state) => state.vmSnapshot);
  const stack = useMemo(() => snapshot?.stack ?? [], [snapshot]);
  const frames = useMemo(() => snapshot?.frames ?? [], [snapshot]);

  // Compute Operand Stack scales
  const maxVal = useMemo(() => {
    if (stack.length === 0) return 10;
    return Math.max(...stack.map(Math.abs), 10);
  }, [stack]);

  const yScale = useMemo(() => scaleLinear([0, maxVal], [0, 70]), [maxVal]);
  const xScale = useMemo(() => {
    const domain = stack.map((_, i) => i);
    return scaleBand(domain, [0, 240], 0.15);
  }, [stack]);

  return (
    <div className="flex flex-col gap-5 min-h-0 overflow-auto rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      {/* 1. Call Stack / Frames Section */}
      <div className="flex flex-col gap-2.5">
        <h2 className="font-sans text-[20px] font-bold text-[var(--ink)] leading-none">
          Call Stack
        </h2>
        
        <div className="flex flex-col gap-2 min-h-[50px]">
          {frames.length === 0 ? (
            <div className="font-mono text-[12px] font-normal opacity-55 text-[var(--muted)]">
              NO FRAMES
            </div>
          ) : (
            // Render call stack top-to-bottom (newest/current frame on top)
            [...frames].reverse().map((frame, index) => {
              const originalIndex = frames.length - 1 - index;
              const isActive = originalIndex === frames.length - 1;

              return (
                <div
                  key={`${originalIndex}-${frame.funcName}`}
                  style={{
                    opacity: isActive ? 1 : 0.45,
                    transition: 'opacity 0.2s ease-in-out',
                  }}
                  className="flex flex-col gap-1 rounded-[6px] border border-[var(--hairline)] bg-[var(--canvas-soft)] p-2.5"
                >
                  {/* Function Name (Primary Content): Geist Mono | 16px | 600 */}
                  <div className="font-mono text-[16px] font-semibold text-[var(--ink)]">
                    {frame.funcName}
                  </div>

                  {/* Locals list (Secondary Metadata): Geist Mono | 12px | 400 | 55% opacity */}
                  {frame.locals && frame.locals.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 border-t border-[rgba(255,255,255,0.05)] pt-1">
                      {frame.locals.map((local) => (
                        <div
                          key={local.name}
                          className="font-mono text-[12px] font-normal text-[var(--body)] opacity-55"
                        >
                          <span className="text-[var(--muted)]">{local.name}:</span> {local.value}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Operand Stack Section */}
      <div className="flex flex-col gap-2.5 border-t border-[var(--hairline)] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-[20px] font-bold text-[var(--ink)] leading-none">
            VM Stack
          </h2>
          {stack.length > 0 && (
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--signal)]">
              {stack.length} item{stack.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="relative flex min-h-[110px] items-end justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas-soft)] p-2">
          {stack.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[12px] font-normal opacity-55 text-[var(--muted)]">
              EMPTY OPERAND STACK
            </div>
          ) : (
            <svg
              viewBox="0 0 240 100"
              width="100%"
              height="100px"
              className="overflow-visible pointer-events-none"
            >
              {stack.map((value, i) => {
                const height = yScale(Math.abs(value));
                const barWidth = xScale.bandwidth;
                const xPos = xScale.x(i);
                // y coordinate starts from 85 (leaving space at the bottom for indices)
                const yPos = 85 - height;

                return (
                  <g key={`${i}-${value}`}>
                    {/* Visual Bar */}
                    <rect
                      x={xPos}
                      y={yPos}
                      width={barWidth}
                      height={Math.max(4, height)}
                      fill="var(--signal)"
                      rx="3"
                      style={{
                        transition: 'height 250ms cubic-bezier(0.16, 1, 0.3, 1), y 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      className="opacity-90"
                    />

                    {/* Value Label (Primary content): Geist Mono | 12px | 600 */}
                    <text
                      x={xPos + barWidth / 2}
                      y={yPos - 6}
                      textAnchor="middle"
                      fill="var(--ink)"
                      className="font-mono text-[10px] font-semibold"
                    >
                      {value}
                    </text>

                    {/* Stack Index Label (Secondary metadata): Geist Mono | 12px | 400 */}
                    <text
                      x={xPos + barWidth / 2}
                      y={97}
                      textAnchor="middle"
                      fill="var(--muted)"
                      className="font-mono text-[8px] font-normal opacity-55"
                    >
                      #{i}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
