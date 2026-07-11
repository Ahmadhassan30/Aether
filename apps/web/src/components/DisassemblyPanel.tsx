"use client";

import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { disassemble } from 'aether-wasm';
import { Cpu, HelpCircle, AlertCircle, Copy, Check } from 'lucide-react';

export default function DisassemblyPanel() {
  const { source, isWasmReady } = useStore();
  const [target, setTarget] = useState<'x86-64' | 'aarch64'>('x86-64');
  const [disasmText, setDisasmText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isWasmReady || !source) {
      setDisasmText('');
      setErrorMsg(null);
      return;
    }

    try {
      // Call the wasm disassemble API
      const result = disassemble(source, target);
      setDisasmText(result);
      setErrorMsg(null);
    } catch (err: unknown) {
      console.error("Disassembly failed:", err);
      // Compile errors from WASM are usually strings containing compiler diagnostics
      if (typeof err === 'string') {
        setErrorMsg(err);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Compilation or lowering failed for native backend.');
      }
      setDisasmText('');
    }
  }, [source, target, isWasmReady]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(disasmText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const lines = disasmText.split('\n').filter(l => l.trim() !== '');

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/20 text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/10 flex-shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Native Codegen Preview
          </span>
        </div>

        {/* Warning label showing this is NOT executed in-browser */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-400/80 font-medium">
          <HelpCircle className="h-3 w-3 flex-shrink-0 text-amber-500" />
          <span>Emitted by native compiler — NOT executed in-browser</span>
        </div>

        {/* Target selector and controls */}
        <div className="flex items-center gap-2">
          {disasmText && (
            <button
              onClick={copyToClipboard}
              className="p-1.5 rounded-lg border border-zinc-850 bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Copy disassembly"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as 'x86-64' | 'aarch64')}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 font-sans focus:outline-none focus:border-violet-500/50"
          >
            <option value="x86-64">x86-64</option>
            <option value="aarch64">aarch64</option>
          </select>
        </div>
      </div>

      {/* Info Banner for smaller screens */}
      <div className="flex md:hidden items-center gap-1.5 px-4 py-1.5 bg-amber-500/5 border-b border-zinc-800/40 text-[9px] text-amber-400/70 font-medium flex-shrink-0">
        <HelpCircle className="h-2.5 w-2.5 flex-shrink-0 text-amber-500" />
        <span>Shows native target assembly output. NOT executed in-browser.</span>
      </div>

      {/* Disassembly Content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed selection:bg-violet-500/20">
        {errorMsg ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-red-500/10 rounded-xl bg-red-500/5 text-red-400 max-w-lg mx-auto mt-8">
            <AlertCircle className="h-6 w-6 text-red-500 mb-2" />
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-1">Target Compilation Error</h4>
            <pre className="text-[10px] text-left text-red-300/80 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono mt-2 p-3 bg-zinc-950 rounded-lg w-full border border-red-500/10 select-text">
              {errorMsg}
            </pre>
          </div>
        ) : lines.length > 0 ? (
          <div className="min-w-max space-y-[2px]">
            {lines.map((line, idx) => {
              const parts = line.split(':');
              const address = parts[0];
              const instruction = parts.slice(1).join(':').trim();

              return (
                <div
                  key={idx}
                  className="px-3 py-0.5 rounded transition-all hover:bg-violet-500/5 select-text"
                >
                  <span className="inline-block w-20 text-[10px] text-zinc-600 font-semibold select-none mr-4">
                    {address}
                  </span>
                  <span className="text-zinc-300">{instruction}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <Cpu className="h-8 w-8 text-zinc-600 mb-2 animate-pulse" />
            <h3 className="text-xs font-semibold text-zinc-500">Waiting for valid compiler output...</h3>
          </div>
        )}
      </div>
    </div>
  );
}
