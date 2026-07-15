"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShinyButton } from "@/components/ui/shiny-button";
import { ShaderBackground } from "@/components/ui/valley-of-the-mind";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import logo from "@/app/logo.png";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03040a]">
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
