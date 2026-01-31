const express = require('express');
const cors = require('cors');
const { Ollama } = require('ollama');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { webSearch, readUrl } = require('./tools/webSearch');
const { runCommand } = require('./tools/terminal');

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MAX_TOOL_ITERATIONS = 10;

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
            description: 'Read the contents of a file. Use this to view code, configuration, or text files.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute or relative path to the file to read' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create a new file or completely overwrite an existing file with new content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file to write' },
                    content: { type: 'string', description: 'Complete content to write to the file' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_file',
            description: 'Edit a file by replacing specific text. Use this for precise modifications to existing files.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file to edit' },
                    old_text: { type: 'string', description: 'Exact text to find and replace (must match exactly)' },
                    new_text: { type: 'string', description: 'Text to replace the old text with' }
                },
                required: ['path', 'old_text', 'new_text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List all files and folders in a directory.',
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
            name: 'create_directory',
            description: 'Create a new directory. Will create parent directories if needed.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path of the directory to create' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_file',
            description: 'Delete a file from the filesystem.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the file to delete' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Execute a shell command. Returns stdout, stderr, and exit status.',
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
            name: 'grep_search',
            description: 'Search for text patterns in files within a directory. Returns matching lines with file paths and line numbers.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Text pattern to search for' },
                    directory: { type: 'string', description: 'Directory to search in' },
                    file_pattern: { type: 'string', description: 'Glob pattern for files to search (e.g., "*.js", "*.py"). Default: all files' }
                },
                required: ['pattern', 'directory']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_files',
            description: 'Find files by name pattern in a directory. Returns list of matching file paths.',
            parameters: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Directory to search in' },
                    pattern: { type: 'string', description: 'Glob pattern to match file names (e.g., "*.js", "package.json")' }
                },
                required: ['directory', 'pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for information. Returns relevant search results with titles, URLs, and snippets.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_url',
            description: 'Read and extract text content from a webpage URL.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL of the webpage to read' }
                },
                required: ['url']
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
                    if (stats.isDirectory()) {
                        result = { success: false, error: 'Path is a directory, use list_directory instead' };
                    } else if (stats.size > 1024 * 1024) {
                        result = { success: false, error: 'File too large (>1MB). Read specific sections instead.' };
                    } else {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        result = { success: true, content, path: filePath, size: stats.size };
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
                result = { success: true, path: filePath, bytesWritten: args.content.length, message: `File written successfully` };
                break;
            }

            case 'edit_file': {
                const filePath = path.resolve(args.path);
                if (!fs.existsSync(filePath)) {
                    result = { success: false, error: `File not found: ${filePath}` };
                } else {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    if (!content.includes(args.old_text)) {
                        result = { success: false, error: 'Old text not found in file. Make sure it matches exactly including whitespace.' };
                    } else {
                        const occurrences = (content.match(new RegExp(escapeRegExp(args.old_text), 'g')) || []).length;
                        const newContent = content.replace(args.old_text, args.new_text);
                        fs.writeFileSync(filePath, newContent, 'utf-8');
                        result = {
                            success: true,
                            path: filePath,
                            message: `Replaced ${occurrences} occurrence(s)`,
                            diff: {
                                removed: args.old_text.split('\n').slice(0, 5),
                                added: args.new_text.split('\n').slice(0, 5)
                            }
                        };
                    }
                }
                break;
            }

            case 'list_directory': {
                const dirPath = path.resolve(args.path);
                if (!fs.existsSync(dirPath)) {
                    result = { success: false, error: `Directory not found: ${dirPath}` };
                } else if (!fs.statSync(dirPath).isDirectory()) {
                    result = { success: false, error: 'Path is not a directory' };
                } else {
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    const items = entries
                        .filter(e => !e.name.startsWith('.'))
                        .slice(0, 50)
                        .map(entry => ({
                            name: entry.name,
                            type: entry.isDirectory() ? 'directory' : 'file'
                        }));
                    result = { success: true, path: dirPath, items, totalItems: entries.length };
                }
                break;
            }

            case 'create_directory': {
                const dirPath = path.resolve(args.path);
                fs.mkdirSync(dirPath, { recursive: true });
                result = { success: true, path: dirPath, message: 'Directory created' };
                break;
            }

            case 'delete_file': {
                const filePath = path.resolve(args.path);
                if (!fs.existsSync(filePath)) {
                    result = { success: false, error: `File not found: ${filePath}` };
                } else if (fs.statSync(filePath).isDirectory()) {
                    result = { success: false, error: 'Cannot delete directory with this tool. Use run_command with rm -r instead.' };
                } else {
                    fs.unlinkSync(filePath);
                    result = { success: true, path: filePath, message: 'File deleted' };
                }
                break;
            }

            case 'run_command': {
                result = await runCommand(args.command, { cwd: args.cwd });
                break;
            }

            case 'grep_search': {
                const { pattern, directory, file_pattern } = args;
                const dirPath = path.resolve(directory);
                if (!fs.existsSync(dirPath)) {
                    result = { success: false, error: `Directory not found: ${dirPath}` };
                } else {
                    const matches = [];
                    const searchDir = (dir, depth = 0) => {
                        if (depth > 5 || matches.length >= 50) return;
                        try {
                            const entries = fs.readdirSync(dir, { withFileTypes: true });
                            for (const entry of entries) {
                                if (matches.length >= 50) break;
                                if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;

                                const fullPath = path.join(dir, entry.name);
                                if (entry.isDirectory()) {
                                    searchDir(fullPath, depth + 1);
                                } else if (entry.isFile()) {
                                    // Check file pattern
                                    if (file_pattern) {
                                        const regex = new RegExp(file_pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
                                        if (!regex.test(entry.name)) continue;
                                    }
                                    try {
                                        const content = fs.readFileSync(fullPath, 'utf-8');
                                        const lines = content.split('\n');
                                        lines.forEach((line, idx) => {
                                            if (line.toLowerCase().includes(pattern.toLowerCase()) && matches.length < 50) {
                                                matches.push({
                                                    file: fullPath,
                                                    line: idx + 1,
                                                    content: line.trim().slice(0, 200)
                                                });
                                            }
                                        });
                                    } catch (e) {
                                        // Skip binary files
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip inaccessible directories
                        }
                    };
                    searchDir(dirPath);
                    result = { success: true, pattern, directory: dirPath, matches, matchCount: matches.length };
                }
                break;
            }

            case 'search_files': {
                const { directory, pattern: filePattern } = args;
                const dirPath = path.resolve(directory);
                if (!fs.existsSync(dirPath)) {
                    result = { success: false, error: `Directory not found: ${dirPath}` };
                } else {
                    const matches = [];
                    const searchDir = (dir, depth = 0) => {
                        if (depth > 5 || matches.length >= 50) return;
                        try {
                            const entries = fs.readdirSync(dir, { withFileTypes: true });
                            const regex = new RegExp(filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
                            for (const entry of entries) {
                                if (matches.length >= 50) break;
                                if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;

                                const fullPath = path.join(dir, entry.name);
                                if (entry.isDirectory()) {
                                    searchDir(fullPath, depth + 1);
                                } else if (regex.test(entry.name)) {
                                    matches.push(fullPath);
                                }
                            }
                        } catch (e) {
                            // Skip inaccessible directories
                        }
                    };
                    searchDir(dirPath);
                    result = { success: true, pattern: filePattern, directory: dirPath, matches };
                }
                break;
            }

            case 'web_search': {
                result = await webSearch(args.query, 5);
                break;
            }

            case 'read_url': {
                result = await readUrl(args.url);
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

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────
// System Prompt - Optimized for agent behavior
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are OpenAgent, a powerful AI assistant that can interact with the user's computer to help with coding, file management, and research tasks.

## Your Capabilities
You have access to these tools:
- **read_file**: Read file contents
- **write_file**: Create or overwrite files
- **edit_file**: Modify specific parts of files (find and replace)
- **list_directory**: List directory contents
- **create_directory**: Create folders
- **delete_file**: Delete files
- **run_command**: Execute shell commands
- **grep_search**: Search for text patterns in code
- **search_files**: Find files by name
- **web_search**: Search the internet
- **read_url**: Read webpage content

## Guidelines
1. **Use tools proactively** - When a task requires file access or commands, use tools immediately
2. **Be thorough** - When editing code, read the file first to understand context
3. **Chain operations** - Complex tasks may require multiple tool calls in sequence
4. **Explain your actions** - Briefly describe what you're doing and why
5. **Handle errors gracefully** - If a tool fails, try an alternative approach
6. **Be precise with edits** - When using edit_file, match the exact text including whitespace

## Best Practices
- Always read a file before editing it
- Use grep_search to find where code is defined before making changes
- After writing files, consider running tests or build commands
- For web research, search first then read specific URLs for details`;

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

        // Build messages for Ollama
        const ollamaMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
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
        let iterations = 0;

        // Handle tool calls in a loop (with max iterations to prevent infinite loops)
        while (response.message.tool_calls && response.message.tool_calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

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
            sendEvent('thinking', { status: `Processing results... (step ${iterations})` });
            response = await ollama.chat({
                model,
                messages: ollamaMessages,
                tools: TOOLS,
                stream: false
            });
        }

        // Now stream the final response
        sendEvent('streaming', { status: 'Generating response...' });

        // Add the final assistant message to get a streaming response
        const finalMessages = [...ollamaMessages];
        if (response.message.content) {
            finalMessages.push(response.message);
        }

        const streamResponse = await ollama.chat({
            model,
            messages: finalMessages,
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
        console.error('Chat error:', error);
        sendEvent('error', { message: error.message });
    }

    res.end();
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`OpenAgent Backend running on http://localhost:${PORT}`);
    console.log(`Ollama host: ${OLLAMA_HOST}`);
    console.log(`Tools available: ${TOOLS.map(t => t.function.name).join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
