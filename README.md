# OpenAgent

**Local AI Agent for your computer**

A desktop application that acts as your personal AI agent, capable of reading/writing files, running terminal commands, and automating tasks on your local machine using Ollama.

## Download

**[Download Latest Release](https://github.com/devartin/OpenAgent/releases/latest)**

### macOS Installation

1. Download `OpenAgent-1.0.0-arm64.dmg`
2. Open the DMG and drag OpenAgent to Applications
3. **Required** (unsigned app): Run in Terminal:
   ```bash
   xattr -cr /Applications/OpenAgent.app
   ```
4. Open OpenAgent

### Requirements

- [Ollama](https://ollama.ai) installed and running
- Pull at least one model:
  ```bash
  ollama pull qwen2.5:7b
  ```

## Features

- **Single Agent Mode** — Sequential task execution
- **Swarm Mode** — Parallel multi-agent orchestration
- **Built-in Tools** — File read/write, directory listing, terminal commands
- **Safety Gates** — Dangerous commands blocked automatically
- **Professional UI** — Dark theme with real-time agent visualization

## Development

```bash
# Clone the repo
git clone https://github.com/devartin/OpenAgent.git
cd OpenAgent

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install

# Start development servers
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3 (optional): Electron
npm run dev:electron
```

### Build Distribution

```bash
npm run build
```

## License

MIT
