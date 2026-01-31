# SwarmLocal

**Local AI Agent Hub - Desktop Application**

Run AI agent swarms locally using Ollama. Choose between Single Agent mode for simple tasks or Swarm Mode for complex parallel execution.

![SwarmLocal Screenshot](/Users/charlesshaw/.gemini/antigravity/brain/7767c70b-109c-4468-ab97-979522cec1a8/swarmlocal_professional_ui_initial_1769819175664.png)

## Download

**[Download Latest Release](https://github.com/charlesshaw3/SwarmLocal/releases/latest)**

### macOS Installation

1. Download `SwarmLocal-1.0.0-arm64.dmg`
2. Open the DMG and drag SwarmLocal to Applications
3. **Important**: The app is not code-signed. To open it:
   ```bash
   xattr -cr /Applications/SwarmLocal.app
   ```
   Or: Right-click the app → Open → Click "Open" in the dialog

### Requirements

- [Ollama](https://ollama.ai) installed and running
- Pull at least one model:
  ```bash
  ollama pull qwen2.5:7b
  ```

## Features

- **User-Selectable Models** — Any Ollama model (supports Q4-Q8 quantized)
- **Single Agent Mode** — Sequential task execution
- **Swarm Mode** — Parallel multi-agent orchestration
- **Built-in Tools** — File read/write, directory listing, terminal commands
- **Safety Gates** — Dangerous commands blocked automatically
- **Professional UI** — Dark theme with real-time agent visualization

## Development

```bash
# Clone the repo
git clone https://github.com/charlesshaw3/SwarmLocal.git
cd SwarmLocal

# Terminal 1: Start backend
cd backend && npm install && npm run dev

# Terminal 2: Start frontend
cd frontend && npm install && npm run dev

# Terminal 3 (optional): Start Electron
npm run dev:electron
```

### Build Distribution

```bash
npm run build
```

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
