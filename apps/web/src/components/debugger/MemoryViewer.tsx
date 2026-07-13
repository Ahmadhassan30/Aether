"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function MemoryViewer() {
  const cells = useCompilerStore((state) => state.vmSnapshot?.memory ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border border-sky-200/10 bg-slate-950/42 shadow-xl shadow-black/20 backdrop-blur">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-950/75 text-[10px] uppercase tracking-[0.18em] text-slate-500 backdrop-blur">
          <tr>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Variable</th>
            <th className="px-3 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {cells.length === 0 ? (
            <tr><td className="px-3 py-3 text-slate-500" colSpan={3}>no frame</td></tr>
          ) : cells.map((cell) => (
            <tr key={`${cell.address}-${cell.variable}`} className="border-t border-sky-200/10">
              <td className="px-3 py-2 font-mono text-slate-600">{cell.address}</td>
              <td className="px-3 py-2 font-mono text-slate-300">{cell.variable}</td>
              <td className="px-3 py-2 font-mono text-sky-100">{cell.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
