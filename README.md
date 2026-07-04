# ◈ Aether

> See the invisible. Understand the machine.

Aether is a live compiler visualization environment for MiniLang++.
Write source code. Watch it compile — token by token, node by node —
through every phase of compilation in real time.

Built for **CS3045 Compiler Construction · Spring 2026**
University of Management and Technology, Lahore, Pakistan

---

## Architecture

```
aether/
├── packages/
│   ├── core/          Rust compiler (saltwater fork + JSON output)
│   └── types/         Shared TypeScript type definitions
├── apps/
│   ├── api/           FastAPI bridge (Python 3.11)
│   └── web/           Next.js 14 visualizer
└── docker/            Container configuration
```

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm 9+, Rust 1.75+, Python 3.11+

cp .env.example .env          # fill in GROQ_API_KEY
pnpm install                  # install JS deps
pnpm core:build               # compile Rust binary
pnpm dev                      # start all services
```

| Service | URL |
|---------|-----|
| Web     | http://localhost:3000 |
| API     | http://localhost:8000 |
| API Docs| http://localhost:8000/docs |

## Tech Stack

| Layer    | Technology               |
|----------|--------------------------|
| Compiler | Rust (saltwater fork)    |
| API      | FastAPI + Python 3.11    |
| Web      | Next.js 14 + TypeScript  |
| Monorepo | Turborepo + pnpm         |
| AI       | Groq llama-3.1-70b       |
| Deploy   | Docker + Compose         |

## Credits

Compiler core forked from
[saltwater](https://github.com/jyn514/rcc) by Jynn Nelson (GPL-2.0).
Aether extensions by Ahmad Hassan, UMT Lahore.
