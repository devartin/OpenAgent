# SwarmLocal

**Local AI Agent Hub - Desktop Application**

A powerful desktop application that runs AI agent swarms locally using Ollama. Choose between Single Agent mode for simple tasks or Swarm Mode for complex parallel execution.

## Download

Download the latest release for your platform:
- **macOS**: SwarmLocal.dmg
- **Windows**: SwarmLocal-Setup.exe
- **Linux**: SwarmLocal.AppImage

## Features

- **User-Selectable Models** — Choose any Ollama model (supports Q4-Q8 quantized)
- **Single Agent Mode** — One model handles tasks sequentially
- **Swarm Mode** — Parallel task decomposition and execution
- **Built-in Tools** — File operations, terminal commands, directory listing
- **Safety Gates** — Dangerous commands are blocked automatically
- **Beautiful UI** — Professional dark theme with real-time agent visualization

## Development

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.ai) installed and running
- At least one model pulled: `ollama pull qwen2.5:7b`

### Run in Development
```bash
# Terminal 1: Start backend
cd backend && npm install && npm run dev

# Terminal 2: Start frontend
cd frontend && npm install && npm run dev

# Terminal 3: Start Electron (optional)
npm run dev:electron
```

### Build for Distribution
```bash
npm run build
```

Outputs will be in the `dist/` folder.

## Architecture

```
SwarmLocal/
├── electron/         # Electron main process
├── backend/          # Express API + Ollama client
│   └── src/
│       ├── server.js
│       ├── orchestrator.js
│       └── tools/
└── frontend/         # Next.js UI
    └── src/app/
```

## License

MIT
