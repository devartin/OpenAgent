# OpenAgent

**Local AI Agent for your computer**

A powerful desktop application that acts as your personal AI agent, capable of reading/writing files, running terminal commands, searching the web, and automating tasks on your local machine using Ollama.

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

### 🤖 Agentic Capabilities
- **read_file** — Read any file's contents
- **write_file** — Create or overwrite files
- **edit_file** — Make targeted edits (search & replace)
- **list_directory** — Explore folder contents
- **create_directory** — Create new folders
- **run_command** — Execute shell commands
- **grep_search** — Search for text across files
- **search_web** — Search the internet for information

### 🎯 Modes
- **Single Agent Mode** — Sequential task execution with full tool access
- **Swarm Mode** — Parallel multi-agent orchestration for complex tasks

### 🛡️ Safety
- Dangerous commands are automatically blocked
- Safety gates prevent destructive operations

### ✨ Premium UI
- Modern glassmorphism design
- Real-time agent activity visualization
- Streaming responses with thinking indicators
- Collapsible tool execution cards
- Dark theme optimized for extended use

## Screenshots

*Coming soon*

## Development

```bash
# Clone the repo
git clone https://github.com/devartin/OpenAgent.git
cd OpenAgent

# Install all dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Start development (all services)
npm run dev

# Or run individually:
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Electron
npm run dev:electron
```

### Build Distribution

```bash
# Build frontend and package Electron app
npm run build
```

Output will be in the `dist/` folder.

## Tech Stack

- **Frontend**: Next.js 16, React
- **Backend**: Express.js, Ollama SDK
- **Desktop**: Electron
- **AI**: Ollama (local LLMs)

## License

MIT
