"use client";

import { ShaderBackground } from "@/components/ui/valley-of-the-mind";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03040a]">
      <ShaderBackground className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,4,10,0.08)_55%,rgba(3,4,10,0.42)_100%)]" />
    </main>
  );
}
