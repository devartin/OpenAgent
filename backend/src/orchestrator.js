const { Ollama } = require('ollama');

/**
 * SwarmOrchestrator - Manages multi-agent task decomposition and execution
 */
class SwarmOrchestrator {
    constructor(ollamaClient, config) {
        this.ollama = ollamaClient;
        this.config = config;
        this.activeAgents = [];
        this.taskQueue = [];
    }

    /**
     * Decompose a complex task into subtasks using the planner model
     */
    async decompose(userPrompt) {
        const plannerPrompt = `You are a task planner. Given a user request, break it into independent subtasks that can be executed in parallel.

User Request: "${userPrompt}"

Respond with a JSON array of subtasks. Each subtask should have:
- "id": unique identifier (1, 2, 3, etc.)
- "description": what needs to be done
- "tool": which tool to use (read_file, write_file, list_directory, run_command)
- "args": arguments for the tool
- "depends_on": array of task IDs this depends on (empty if independent)

Example:
[
  {"id": 1, "description": "List home directory", "tool": "list_directory", "args": {"path": "/Users"}, "depends_on": []},
  {"id": 2, "description": "Create greeting file", "tool": "write_file", "args": {"path": "/tmp/hello.txt", "content": "Hello!"}, "depends_on": []}
]

Only respond with the JSON array, no other text.`;

        try {
            const response = await this.ollama.chat({
                model: this.config.plannerModel,
                messages: [{ role: 'user', content: plannerPrompt }],
                stream: false
            });

            const content = response.message.content.trim();
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [];
        } catch (error) {
            console.error('Decomposition failed:', error);
            return [];
        }
    }

    /**
     * Execute tasks in parallel where possible
     */
    async executeSwarm(tasks, toolExecutor, onProgress) {
        const results = {};
        const completed = new Set();
        const pending = [...tasks];

        while (pending.length > 0) {
            // Find tasks that can run (all dependencies completed)
            const runnable = pending.filter(task =>
                task.depends_on.every(dep => completed.has(dep))
            );

            if (runnable.length === 0) {
                // Circular dependency or error
                break;
            }

            // Execute runnable tasks in parallel
            const executions = runnable.map(async (task) => {
                const agentId = `agent-${task.id}`;
                this.activeAgents.push({ id: agentId, task: task.description, status: 'running' });

                if (onProgress) {
                    onProgress({ type: 'agent_start', agentId, task: task.description });
                }

                try {
                    const result = await toolExecutor(task.tool, task.args);
                    results[task.id] = { success: true, result };

                    if (onProgress) {
                        onProgress({ type: 'agent_complete', agentId, result });
                    }
                } catch (error) {
                    results[task.id] = { success: false, error: error.message };

                    if (onProgress) {
                        onProgress({ type: 'agent_error', agentId, error: error.message });
                    }
                }

                completed.add(task.id);
                this.activeAgents = this.activeAgents.filter(a => a.id !== agentId);
            });

            await Promise.all(executions);

            // Remove completed tasks from pending
            for (const task of runnable) {
                const idx = pending.findIndex(t => t.id === task.id);
                if (idx !== -1) pending.splice(idx, 1);
            }
        }

        return results;
    }

    /**
     * Synthesize results into a final response
     */
    async synthesize(userPrompt, results) {
        const synthesisPrompt = `You executed the following tasks for the user's request: "${userPrompt}"

Results:
${JSON.stringify(results, null, 2)}

Provide a concise summary of what was accomplished. Be helpful and clear.`;

        try {
            const response = await this.ollama.chat({
                model: this.config.plannerModel,
                messages: [{ role: 'user', content: synthesisPrompt }],
                stream: false
            });

            return response.message.content;
        } catch (error) {
            return `Tasks completed. ${Object.keys(results).length} operations executed.`;
        }
    }

    getActiveAgents() {
        return this.activeAgents;
    }
}

module.exports = { SwarmOrchestrator };
