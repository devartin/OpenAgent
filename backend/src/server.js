const express = require('express');
const cors = require('cors');
const { Ollama } = require('ollama');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { SwarmOrchestrator } = require('./orchestrator');
const { runCommand } = require('./tools/terminal');

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Initialize Ollama client
const ollama = new Ollama({ host: OLLAMA_HOST });

// Conversation storage (in-memory for now)
const conversations = new Map();

// ─────────────────────────────────────────────────────────────
// Set up Express app
// ─────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────────────────────
// Tool Definitions for the AI
// ─────────────────────────────────────────────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file from the filesystem',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute or relative path to the file' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Write content to a file on the filesystem',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file to write' },
                    content: { type: 'string', description: 'Content to write to the file' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List contents of a directory',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the directory to list' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Execute a shell command. Use with caution.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The shell command to execute' },
                    cwd: { type: 'string', description: 'Working directory for the command (optional)' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_files',
            description: 'Search for files matching a pattern in a directory',
            parameters: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Directory to search in' },
                    pattern: { type: 'string', description: 'Glob pattern to match (e.g., "*.js")' }
                },
                required: ['directory', 'pattern']
            }
        }
    }
];

// ─────────────────────────────────────────────────────────────
// Tool Execution Functions
// ─────────────────────────────────────────────────────────────
async function executeToolCall(name, args) {
    const startTime = Date.now();
    let result;

    try {
        switch (name) {
            case 'read_file': {
                const filePath = path.resolve(args.path);
                if (!fs.existsSync(filePath)) {
                    result = { success: false, error: `File not found: ${filePath}` };
                } else {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 1024 * 1024) {
                        result = { success: false, error: 'File too large (>1MB)' };
                    } else {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        result = { success: true, content, size: stats.size };
                    }
                }
                break;
            }

            case 'write_file': {
                const filePath = path.resolve(args.path);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, args.content, 'utf-8');
                result = { success: true, path: filePath, bytesWritten: args.content.length };
                break;
            }

            case 'list_directory': {
                const dirPath = path.resolve(args.path);
                if (!fs.existsSync(dirPath)) {
                    result = { success: false, error: `Directory not found: ${dirPath}` };
                } else {
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    const items = entries.map(entry => ({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        path: path.join(dirPath, entry.name)
                    }));
                    result = { success: true, path: dirPath, items };
                }
                break;
            }

            case 'run_command': {
                result = await runCommand(args.command, { cwd: args.cwd });
                break;
            }

            case 'search_files': {
                const { directory, pattern } = args;
                const dirPath = path.resolve(directory);
                if (!fs.existsSync(dirPath)) {
                    result = { success: false, error: `Directory not found: ${dirPath}` };
                } else {
                    // Simple glob matching
                    const matches = [];
                    const searchDir = (dir, depth = 0) => {
                        if (depth > 5) return; // Limit depth
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path.join(dir, entry.name);
                            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                                searchDir(fullPath, depth + 1);
                            } else if (entry.isFile()) {
                                // Simple pattern matching
                                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
                                if (regex.test(entry.name)) {
                                    matches.push(fullPath);
                                }
                            }
                        }
                    };
                    searchDir(dirPath);
                    result = { success: true, matches: matches.slice(0, 50) };
                }
                break;
            }

            default:
                result = { success: false, error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        result = { success: false, error: error.message };
    }

    return {
        ...result,
        executionTime: Date.now() - startTime
    };
}

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get available Ollama models
app.get('/api/models', async (req, res) => {
    try {
        const response = await ollama.list();
        res.json({ models: response.models || [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models. Is Ollama running?' });
    }
});

// Get conversations list
app.get('/api/conversations', (req, res) => {
    const list = Array.from(conversations.entries()).map(([id, conv]) => ({
        id,
        title: conv.title || 'New Chat',
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length
    }));
    res.json({ conversations: list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) });
});

// Get conversation by ID
app.get('/api/conversations/:id', (req, res) => {
    const conv = conversations.get(req.params.id);
    if (!conv) {
        return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conv);
});

// Create new conversation
app.post('/api/conversations', (req, res) => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const conv = {
        id,
        title: 'New Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
    };
    conversations.set(id, conv);
    res.json(conv);
});

// Delete conversation
app.delete('/api/conversations/:id', (req, res) => {
    conversations.delete(req.params.id);
    res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Chat endpoint with streaming (SSE)
// ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    const { conversationId, message, model = 'llama3.2:latest' } = req.body;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
        // Get or create conversation
        let conv = conversations.get(conversationId);
        if (!conv) {
            conv = {
                id: conversationId || `conv_${Date.now()}`,
                title: 'New Chat',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: []
            };
            conversations.set(conv.id, conv);
        }

        // Add user message
        conv.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        // Generate title from first message
        if (conv.messages.length === 1) {
            conv.title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        }

        // System prompt
        const systemPrompt = `You are OpenAgent, a powerful AI assistant that can help with coding, file management, and system tasks.
You have access to the following tools:
- read_file: Read contents of a file
- write_file: Write content to a file
- list_directory: List contents of a directory
- run_command: Execute shell commands
- search_files: Search for files by pattern

When you need to use a tool, you MUST respond with a tool call. Always explain what you're doing before using tools.
Be helpful, concise, and proactive. If a task requires multiple steps, break it down clearly.`;

        // Build messages for Ollama
        const ollamaMessages = [
            { role: 'system', content: systemPrompt },
            ...conv.messages.map(m => ({ role: m.role, content: m.content }))
        ];

        sendEvent('thinking', { status: 'Analyzing your request...' });

        // Initial chat call with tools
        let response = await ollama.chat({
            model,
            messages: ollamaMessages,
            tools: TOOLS,
            stream: false
        });

        let fullResponse = '';
        let toolCalls = [];

        // Handle tool calls in a loop
        while (response.message.tool_calls && response.message.tool_calls.length > 0) {
            for (const toolCall of response.message.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = toolCall.function.arguments;

                sendEvent('tool_start', {
                    tool: toolName,
                    args: toolArgs,
                    status: 'Executing...'
                });

                const toolResult = await executeToolCall(toolName, toolArgs);

                sendEvent('tool_complete', {
                    tool: toolName,
                    result: toolResult,
                    executionTime: toolResult.executionTime
                });

                toolCalls.push({
                    name: toolName,
                    args: toolArgs,
                    result: toolResult
                });

                // Add tool result to messages
                ollamaMessages.push(response.message);
                ollamaMessages.push({
                    role: 'tool',
                    content: JSON.stringify(toolResult)
                });
            }

            // Continue the conversation with tool results
            sendEvent('thinking', { status: 'Processing results...' });
            response = await ollama.chat({
                model,
                messages: ollamaMessages,
                tools: TOOLS,
                stream: false
            });
        }

        // Now stream the final response
        sendEvent('streaming', { status: 'Generating response...' });

        const streamResponse = await ollama.chat({
            model,
            messages: [...ollamaMessages, response.message],
            stream: true
        });

        for await (const chunk of streamResponse) {
            if (chunk.message?.content) {
                fullResponse += chunk.message.content;
                sendEvent('token', { content: chunk.message.content });
            }
        }

        // If no streaming happened, use the non-streamed response
        if (!fullResponse && response.message.content) {
            fullResponse = response.message.content;
            sendEvent('token', { content: fullResponse });
        }

        // Save assistant message
        conv.messages.push({
            role: 'assistant',
            content: fullResponse,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: new Date().toISOString()
        });

        conv.updatedAt = new Date().toISOString();

        sendEvent('complete', {
            conversationId: conv.id,
            messageId: `msg_${Date.now()}`
        });

    } catch (error) {
        sendEvent('error', { message: error.message });
    }

    res.end();
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 OpenAgent Backend running on http://localhost:${PORT}`);
    console.log(`📡 Ollama host: ${OLLAMA_HOST}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
