"use client";

import React from 'react';
import { useCompilerStore } from '../../stores/compilerStore';

export default function MemoryViewer() {
  const cells = useCompilerStore((state) => state.vmSnapshot?.memory ?? []);

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border border-white/50 bg-white/35 shadow-xl shadow-stone-900/5 backdrop-blur">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-white/55 text-[10px] uppercase tracking-[0.18em] text-stone-400 backdrop-blur">
          <tr>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Variable</th>
            <th className="px-3 py-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {cells.length === 0 ? (
            <tr><td className="px-3 py-3 text-stone-400" colSpan={3}>no frame</td></tr>
          ) : cells.map((cell) => (
            <tr key={`${cell.address}-${cell.variable}`} className="border-t border-white/35">
              <td className="px-3 py-2 font-mono text-stone-400">{cell.address}</td>
              <td className="px-3 py-2 font-mono text-stone-700">{cell.variable}</td>
              <td className="px-3 py-2 font-mono text-teal-900">{cell.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
