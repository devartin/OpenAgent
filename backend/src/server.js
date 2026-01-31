const express = require('express');
const cors = require('cors');
const { Ollama } = require('ollama');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Ollama client (configurable URL)
let ollamaClient = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

// In-memory config
let config = {
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    defaultModel: 'qwen2.5:7b',
    mode: 'single', // 'single' or 'swarm'
    plannerModel: 'qwen2.5:7b',
    workerModel: 'qwen2.5:3b'
};

// Tools
const filesystemTool = require('./tools/filesystem');
const terminalTool = require('./tools/terminal');

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: config.mode });
});

// Get/Set config
app.get('/config', (req, res) => {
    res.json(config);
});

app.post('/config', (req, res) => {
    const { ollamaHost, defaultModel, mode, plannerModel, workerModel } = req.body;
    if (ollamaHost) {
        config.ollamaHost = ollamaHost;
        ollamaClient = new Ollama({ host: ollamaHost });
    }
    if (defaultModel) config.defaultModel = defaultModel;
    if (mode) config.mode = mode;
    if (plannerModel) config.plannerModel = plannerModel;
    if (workerModel) config.workerModel = workerModel;
    res.json(config);
});

// List available Ollama models
app.get('/models', async (req, res) => {
    try {
        const response = await ollamaClient.list();
        res.json(response.models || []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch models from Ollama', details: error.message });
    }
});

// ─────────────────────────────────────────────────────────────
// Tool definitions for the model
// ─────────────────────────────────────────────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file at the given path',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Write content to a file at the given path',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file' },
                    content: { type: 'string', description: 'Content to write' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List files and directories at the given path',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the directory' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Execute a shell command and return the output',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The shell command to execute' }
                },
                required: ['command']
            }
        }
    }
];

// Execute a tool call
async function executeTool(toolName, args) {
    switch (toolName) {
        case 'read_file':
            return await filesystemTool.readFile(args.path);
        case 'write_file':
            return await filesystemTool.writeFile(args.path, args.content);
        case 'list_directory':
            return await filesystemTool.listDirectory(args.path);
        case 'run_command':
            return await terminalTool.runCommand(args.command);
        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// ─────────────────────────────────────────────────────────────
// Chat endpoint (Single Agent Mode)
// ─────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
    const { messages, model } = req.body;
    const selectedModel = model || config.defaultModel;

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        let conversationMessages = [
            {
                role: 'system',
                content: `You are SwarmLocal, a helpful AI assistant with access to local computer tools. You can read/write files, list directories, and run shell commands. Always use tools when the user asks you to interact with their computer. Be concise and helpful.`
            },
            ...messages
        ];

        let continueLoop = true;
        let iterations = 0;
        const MAX_ITERATIONS = 10;

        while (continueLoop && iterations < MAX_ITERATIONS) {
            iterations++;

            const response = await ollamaClient.chat({
                model: selectedModel,
                messages: conversationMessages,
                tools: TOOLS,
                stream: false
            });

            const assistantMessage = response.message;

            // Check for tool calls
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                // Add assistant message with tool calls to conversation
                conversationMessages.push(assistantMessage);

                // Execute each tool call
                for (const toolCall of assistantMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgs = toolCall.function.arguments;

                    res.write(`data: ${JSON.stringify({ type: 'tool_call', name: toolName, args: toolArgs })}\n\n`);

                    const toolResult = await executeTool(toolName, toolArgs);

                    res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolName, result: toolResult })}\n\n`);

                    // Add tool result to conversation
                    conversationMessages.push({
                        role: 'tool',
                        content: JSON.stringify(toolResult)
                    });
                }
            } else {
                // No tool calls, send final response
                res.write(`data: ${JSON.stringify({ type: 'message', content: assistantMessage.content })}\n\n`);
                continueLoop = false;
            }
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();

    } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// Swarm Mode Chat endpoint
// ─────────────────────────────────────────────────────────────
const { SwarmOrchestrator } = require('./orchestrator');

app.post('/chat/swarm', async (req, res) => {
    const { message } = req.body;

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const orchestrator = new SwarmOrchestrator(ollamaClient, config);

        // Phase 1: Decompose
        res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'decomposing', message: 'Breaking down your request...' })}\n\n`);

        const tasks = await orchestrator.decompose(message);

        if (tasks.length === 0) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Could not decompose task. Try single agent mode.' })}\n\n`);
            res.end();
            return;
        }

        res.write(`data: ${JSON.stringify({ type: 'tasks', tasks })}\n\n`);

        // Phase 2: Execute in parallel
        res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'executing', message: `Executing ${tasks.length} agents in parallel...` })}\n\n`);

        const results = await orchestrator.executeSwarm(tasks, executeTool, (progress) => {
            res.write(`data: ${JSON.stringify(progress)}\n\n`);
        });

        // Phase 3: Synthesize
        res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'synthesizing', message: 'Summarizing results...' })}\n\n`);

        const summary = await orchestrator.synthesize(message, results);

        res.write(`data: ${JSON.stringify({ type: 'message', content: summary })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', results })}\n\n`);
        res.end();

    } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✨ SwarmLocal Backend running on http://localhost:${PORT}`);
    console.log(`📦 Mode: ${config.mode}`);
    console.log(`🤖 Default Model: ${config.defaultModel}`);
});

