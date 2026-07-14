"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function MemoryViewer() {
  const cells = useCompilerStore((state) => state.vmSnapshot?.memory ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-[4px] border border-[var(--hairline)] bg-[var(--canvas)]">
      <table className="w-full text-left text-[10px]">
        <thead className="sticky top-0 bg-[var(--canvas-soft)] text-[8px] uppercase tracking-[0.12em] text-[var(--muted)]">
          <tr>
            <th className="px-2 py-1.5">Addr</th>
            <th className="px-2 py-1.5">Variable</th>
            <th className="px-2 py-1.5">Value</th>
          </tr>
        </thead>
        <tbody>
          {cells.length === 0 ? (
            <tr><td className="px-2 py-2 text-[var(--muted)]" colSpan={3}>no frame</td></tr>
          ) : cells.map((cell) => (
            <tr key={`${cell.address}-${cell.variable}`} className="border-t border-[var(--hairline)]">
              <td className="px-2 py-1.5 font-mono text-[var(--muted)]">{cell.address}</td>
              <td className="px-2 py-1.5 font-mono text-[var(--body-strong)]">{cell.variable}</td>
              <td className="px-2 py-1.5 font-mono text-[var(--ink)]">{cell.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
