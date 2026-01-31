const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Dangerous command patterns
const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~\//,
    /sudo\s+rm/,
    /mkfs\./,
    /dd\s+if=/,
    />\s*\/dev\/sda/,
    /chmod\s+-R\s+777\s+\//,
    /:\(\)\{\s*:\|:&\s*\};:/  // fork bomb
];

/**
 * Check if a command is potentially dangerous
 * @param {string} command - The command to check
 * @returns {boolean}
 */
function isDangerous(command) {
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Run a shell command
 * @param {string} command - The command to execute
 * @param {Object} options - Execution options
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>}
 */
async function runCommand(command, options = {}) {
    // Safety check
    if (isDangerous(command)) {
        return {
            success: false,
            error: 'SAFETY GATE: This command appears dangerous and has been blocked. Destructive commands require explicit user approval.'
        };
    }

    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: options.timeout || 30000, // 30 second default timeout
            maxBuffer: 1024 * 1024 * 5, // 5MB buffer
            cwd: options.cwd || process.env.HOME
        });

        return {
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim()
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stdout: error.stdout?.trim(),
            stderr: error.stderr?.trim()
        };
    }
}

module.exports = {
    runCommand,
    isDangerous
};
