"use client";

import React, { useState, useRef, useEffect } from 'react';

interface ResizableLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export default function ResizableLayout({ left, right }: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(50); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      // Constraint to between 20% and 80%
      setLeftWidth(Math.max(20, Math.min(80, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full overflow-hidden select-none"
    >
      {/* Left Pane */}
      <div
        style={{ width: `${leftWidth}%` }}
        className="h-full overflow-hidden"
      >
        {left}
      </div>

      {/* Splitter */}
      <div
        onMouseDown={startResize}
        className={`w-1.5 h-full cursor-col-resize hover:bg-zinc-700/80 active:bg-zinc-600 transition-colors flex-shrink-0 z-50 relative ${
          isDragging ? 'bg-zinc-600' : 'bg-zinc-800/40'
        }`}
      >
        {/* Visual Line inside splitter */}
        <div className="absolute inset-y-0 left-1/2 w-[1px] bg-zinc-800 -translate-x-1/2" />
      </div>

      {/* Right Pane */}
      <div
        style={{ width: `${100 - leftWidth}%` }}
        className="h-full overflow-hidden"
      >
        {right}
      </div>

      {/* Dragging Overlay to prevent Monaco iframe capture */}
      {isDragging && (
        <div className="absolute inset-0 z-40 cursor-col-resize" />
      )}
    </div>
  );
}
