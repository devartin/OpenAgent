const fs = require('fs').promises;
const path = require('path');

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

module.exports = {
    readFile,
    writeFile,
    listDirectory,
    deleteFile
};
