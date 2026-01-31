# OpenAgent

**Local AI Agent for Your Computer** - An Electron app that uses Ollama to run AI assistants locally with file access, terminal commands, and more.

![OpenAgent](https://img.shields.io/badge/Version-2.0.1-blue) ![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey) ![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **Premium UI** - Modern dark theme with real-time streaming responses
- **Agentic Capabilities** - Read/write files, run commands, search the web
- **Local & Private** - All AI processing happens on your machine via Ollama
- **Tool Visualization** - See what the AI is doing with animated tool cards
- **Conversation History** - Sidebar with chat history and model selector

## 📋 Requirements

Before installing OpenAgent, you need:

1. **macOS 10.12+** (Apple Silicon or Intel)
2. **Node.js 18+** - [Download from nodejs.org](https://nodejs.org)
3. **Ollama** - [Download from ollama.ai](https://ollama.ai)

## 🚀 Installation

### Step 1: Download

Download the latest release from [GitHub Releases](https://github.com/devartin/OpenAgent/releases):
- `OpenAgent-x.x.x-arm64.dmg` - For Apple Silicon Macs (M1/M2/M3)
- `OpenAgent-x.x.x-arm64-mac.zip` - Portable version

### Step 2: Install from DMG

1. Open the DMG file
2. Drag OpenAgent to your Applications folder

### Step 3: Important - First Launch (macOS Security)

⚠️ **Because OpenAgent is not notarized with Apple, macOS will block it on first launch.**

**To fix this, run this command in Terminal:**

```bash
xattr -cr /Applications/OpenAgent.app
```

Then you can open the app normally.

**Alternative method:**
1. Try to open OpenAgent (it will show the "damaged" error)
2. Go to **System Settings > Privacy & Security**
3. Scroll down and click **"Open Anyway"** next to the OpenAgent message

### Step 4: Set Up Ollama

Make sure Ollama is running with at least one model:

```bash
# Install a model (if you haven't already)
ollama pull llama3.2

# Ollama should be running automatically, but you can verify:
ollama serve
```

### Step 5: Launch OpenAgent!

Open OpenAgent from your Applications folder. It will connect to Ollama automatically.

## 🛠 Development

### Clone and Install

```bash
git clone https://github.com/devartin/OpenAgent.git
cd OpenAgent

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install backend dependencies
cd backend && npm install && cd ..
```

### Run in Development Mode

```bash
npm run dev
```

This starts the backend server, frontend dev server, and Electron app concurrently.

### Build for Production

```bash
npm run build
```

This builds the frontend and packages the Electron app.

## 📁 Project Structure

```
OpenAgent/
├── electron/          # Electron main process
│   └── main.js
├── frontend/          # Next.js frontend
│   └── src/app/
│       ├── page.js    # Main UI
│       ├── layout.js  # Root layout
│       └── globals.css # Design system
├── backend/           # Express backend
│   └── src/
│       ├── server.js  # API server with SSE
│       └── tools/     # Agentic tools
│           ├── filesystem.js
│           ├── terminal.js
│           └── web.js
└── package.json       # Root config & build
```

## 🔧 Troubleshooting

### "OpenAgent is damaged and can't be opened"
Run: `xattr -cr /Applications/OpenAgent.app`

### "No models found"
Make sure Ollama is running: `ollama serve`
And you have at least one model: `ollama list`

### Backend not starting
OpenAgent requires Node.js. Check: `node --version`
Install from https://nodejs.org if missing.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
