"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShinyButton } from "@/components/ui/shiny-button";
import { ShaderBackground } from "@/components/ui/valley-of-the-mind";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import logo from "@/app/logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ahmadImage from "@/app/ahamd.jpg";

import { useState } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [showAttribution, setShowAttribution] = useState(false);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03040a]">
      {/* Top Header with Developer Attribution */}
      <header className="absolute top-0 left-0 right-0 z-20 flex justify-center p-6 select-none">
        <div className={`flex items-center gap-3 bg-black/45 backdrop-blur p-2 pr-4 rounded-full border border-white/[0.04] shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out ${showAttribution ? 'max-w-[400px] pl-2' : 'max-w-[56px] pl-2'
          }`}>
          <button
            onClick={() => setShowAttribution(!showAttribution)}
            className="relative rounded-full focus:outline-none transition active:scale-95"
            title="Click to toggle developer attribution"
          >
            <Avatar className="h-10 w-10 border border-white/10 hover:border-white/20 transition-all">
              <AvatarImage src={ahmadImage.src} alt="Ahmad Hassan" className="object-cover" />
              <AvatarFallback className="bg-zinc-800 text-white text-[10px] font-bold">AH</AvatarFallback>
            </Avatar>
          </button>

          <div className={`overflow-hidden transition-all duration-500 ease-in-out flex items-center shrink-0 ${showAttribution ? 'max-w-[300px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-2'
            }`}>
            <span className="text-zinc-400 font-sans text-xs tracking-wide select-none whitespace-nowrap">
              Researched & Developed by <strong className="text-zinc-200 font-semibold">Ahmad Hassan</strong>
            </span>
          </div>
        </div>
      </header>

      <ShaderBackground className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,4,10,0.08)_55%,rgba(3,4,10,0.42)_100%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center -translate-y-24">
        <div className="flex flex-col items-center gap-0">
          <Image
            src={logo}
            alt="Aether"
            priority
            className="h-auto w-32 sm:w-40 drop-shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
          />
          <ShinyButton
            ariaLabel="Open playground"
            className="min-h-[4.1rem] -mt-8"
            onClick={() => router.push("/playground")}
          >
            Playground
          </ShinyButton>
        </div>
      </div>

      {/* Footer outlined signature */}
      <div className="absolute -bottom-10 left-0 right-0 w-full h-40 sm:h-52 flex items-center justify-center opacity-[0.22] hover:opacity-60 transition-opacity duration-700">
        <TextHoverEffect text="Aether" fontSize={92} />
      </div>
    </main>
  );
}
