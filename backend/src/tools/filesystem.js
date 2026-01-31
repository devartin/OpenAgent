const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

/**
 * Read a file's contents
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function readFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Write content to a file
 * @param {string} filePath - Absolute path to the file
 * @param {string} content - Content to write
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function writeFile(filePath, content) {
    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true, message: `File written to ${filePath}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Edit a file by replacing content
 * @param {string} filePath - Absolute path to the file
 * @param {string} searchContent - Content to search for
 * @param {string} replaceContent - Content to replace with
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function editFile(filePath, searchContent, replaceContent) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');

        if (!content.includes(searchContent)) {
            return {
                success: false,
                error: 'Search content not found in file. Make sure the search string matches exactly.'
            };
        }

        const newContent = content.replace(searchContent, replaceContent);
        await fs.writeFile(filePath, newContent, 'utf-8');

        return {
            success: true,
            message: `File edited successfully: ${filePath}`,
            replacements: (content.match(new RegExp(escapeRegex(searchContent), 'g')) || []).length
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Helper to escape regex special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List directory contents
 * @param {string} dirPath - Absolute path to the directory
 * @returns {Promise<{success: boolean, entries?: Array, error?: string}>}
 */
async function listDirectory(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const result = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        }));
        return { success: true, entries: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Create a directory
 * @param {string} dirPath - Absolute path to the directory
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createDirectory(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true, message: `Directory created: ${dirPath}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a file
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteFile(filePath) {
    try {
        await fs.unlink(filePath);
        return { success: true, message: `Deleted ${filePath}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Search for text in files using grep
 * @param {string} pattern - Search pattern
 * @param {string} directory - Directory to search in
 * @param {Object} options - Search options
 * @returns {Promise<{success: boolean, matches?: Array, error?: string}>}
 */
async function grepSearch(pattern, directory, options = {}) {
    try {
        const {
            recursive = true,
            ignoreCase = false,
            filePattern = '*',
            maxResults = 50
        } = options;

        // Build grep command
        const flags = ['-n']; // Line numbers
        if (recursive) flags.push('-r');
        if (ignoreCase) flags.push('-i');

        // Use grep with file pattern
        const cmd = `grep ${flags.join(' ')} --include="${filePattern}" "${pattern}" "${directory}" 2>/dev/null | head -n ${maxResults}`;

        const { stdout, stderr } = await execAsync(cmd, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 2
        });

        if (!stdout.trim()) {
            return {
                success: true,
                matches: [],
                message: `No matches found for "${pattern}" in ${directory}`
            };
        }

        // Parse grep output
        const matches = stdout.trim().split('\n').map(line => {
            const match = line.match(/^(.+?):(\d+):(.*)$/);
            if (match) {
                return {
                    file: match[1],
                    line: parseInt(match[2]),
                    content: match[3].trim()
                };
            }
            return { raw: line };
        });

        return {
            success: true,
            matches,
            count: matches.length,
            pattern,
            directory
        };
    } catch (error) {
        // grep returns exit code 1 when no matches found
        if (error.code === 1 && !error.stderr) {
            return {
                success: true,
                matches: [],
                message: `No matches found for "${pattern}" in ${directory}`
            };
        }
        return { success: false, error: error.message };
    }
}

/**
 * Get file info (size, modified date, etc.)
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<{success: boolean, info?: Object, error?: string}>}
 */
async function getFileInfo(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return {
            success: true,
            info: {
                path: filePath,
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    readFile,
    writeFile,
    editFile,
    listDirectory,
    createDirectory,
    deleteFile,
    grepSearch,
    getFileInfo
};
