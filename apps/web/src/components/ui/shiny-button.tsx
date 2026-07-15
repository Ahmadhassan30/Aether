"use client";

import type React from "react";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ShinyButton({ children, onClick, className = "" }: ShinyButtonProps) {
  return (
    <>
      <style jsx>{`
        @property --gradient-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @property --gradient-angle-offset {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @property --gradient-percent {
          syntax: "<percentage>";
          initial-value: 5%;
          inherits: false;
        }

        @property --gradient-shine {
          syntax: "<color>";
          initial-value: white;
          inherits: false;
        }

        .shiny-cta {
          --shiny-cta-fg: #ffffff;
          --shiny-cta-highlight: #1115ff;
          --transition: 450ms cubic-bezier(0.25, 1, 0.5, 1);

          isolation: isolate;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          outline-offset: 4px;
          min-width: 20rem;
          padding: 1.45rem 3.25rem;
          font-size: 1.38rem;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.03em;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 360px;
          color: var(--shiny-cta-fg);
          background:
            radial-gradient(circle at 88% 50%, rgba(35, 41, 255, 0.95) 0%, rgba(18, 22, 155, 0.82) 24%, rgba(4, 5, 28, 0.95) 48%, transparent 64%),
            linear-gradient(90deg, #020202 0%, #050505 44%, #060819 100%);
          background-size: 185% 100%, 100% 100%;
          background-position: 115% 50%, 0 0;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.04),
            inset 0 0 28px rgba(35, 41, 255, 0.18),
            0 0 0 1px rgba(42, 47, 180, 0.32),
            0 28px 90px rgba(0, 0, 0, 0.55);
          transition: var(--transition);
          transition-property: transform, box-shadow, border-color;
          animation: gradient-drift 3.2s ease-in-out infinite;
        }

        .shiny-cta::before,
        .shiny-cta::after,
        .shiny-cta span::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset-inline-start: 50%;
          inset-block-start: 50%;
          translate: -50% -50%;
          z-index: -1;
        }

        .shiny-cta:active {
          transform: translateY(1px);
        }

        .shiny-cta::before {
          width: 9.5rem;
          height: 7rem;
          inset-inline-start: auto;
          left: auto;
          right: -0.8rem;
          inset-block-start: 50%;
          translate: 0 -50%;
          background: radial-gradient(
              circle at 1px 1px,
              rgba(141, 153, 255, 0.7) 1px,
              transparent 0
            )
            padding-box;
          background-size: 6px 6px;
          mask-image: radial-gradient(circle at 60% 50%, black 0%, black 35%, transparent 72%);
          border-radius: inherit;
          opacity: 0.75;
          z-index: -1;
          animation: dot-drift 2.6s linear infinite;
        }

        .shiny-cta::after {
          width: 11rem;
          height: 8rem;
          inset-inline-start: auto;
          left: auto;
          right: -2.2rem;
          inset-block-start: 50%;
          translate: 0 -50%;
          background: radial-gradient(circle at center, rgba(36, 44, 255, 0.78), transparent 68%);
          opacity: 0.9;
          filter: blur(4px);
          animation: glow-sweep 2.9s ease-in-out infinite;
        }

        .shiny-cta span {
          position: relative;
          z-index: 1;
        }

        .shiny-cta:is(:hover, :focus-visible) {
          transform: translateY(-1px);
          border-color: rgba(129, 140, 248, 0.28);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.06),
            inset 0 0 34px rgba(35, 41, 255, 0.26),
            0 0 0 1px rgba(70, 76, 220, 0.5),
            0 28px 100px rgba(22, 28, 180, 0.28);
        }

        @keyframes gradient-drift {
          0%,
          100% {
            background-position: 122% 50%, 0 0;
          }
          50% {
            background-position: 72% 50%, 0 0;
          }
        }

        @keyframes dot-drift {
          0% {
            background-position: 0 0;
            opacity: 0.55;
          }
          50% {
            opacity: 0.9;
          }
          100% {
            background-position: 18px 6px;
            opacity: 0.55;
          }
        }

        @keyframes glow-sweep {
          0%,
          100% {
            right: -2.7rem;
            opacity: 0.48;
            scale: 0.92;
          }
          45% {
            right: 0.4rem;
            opacity: 0.95;
            scale: 1.08;
          }
          70% {
            right: -0.4rem;
            opacity: 0.78;
            scale: 1;
          }
        }
      `}</style>

      <button className={`shiny-cta ${className}`} onClick={onClick}>
        <span>{children}</span>
      </button>
    </>
  );
}
