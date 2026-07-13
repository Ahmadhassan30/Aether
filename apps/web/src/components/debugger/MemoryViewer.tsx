"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function MemoryViewer() {
  const cells = useCompilerStore((state) => state.vmSnapshot?.memory ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <tr>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Variable</th>
            <th className="px-3 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {cells.length === 0 ? (
            <tr><td className="px-3 py-3 text-zinc-500" colSpan={3}>no frame</td></tr>
          ) : cells.map((cell) => (
            <tr key={`${cell.address}-${cell.variable}`} className="border-t border-zinc-900">
              <td className="px-3 py-2 font-mono text-zinc-500">{cell.address}</td>
              <td className="px-3 py-2 font-mono text-zinc-300">{cell.variable}</td>
              <td className="px-3 py-2 font-mono text-emerald-200">{cell.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
