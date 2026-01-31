const fs = require('fs');
const path = require('path');

/**
 * File system tools for the AI agent
 */

// Safety limits
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_LIST = 100;
const DANGEROUS_PATHS = ['/etc', '/usr', '/bin', '/sbin', '/var', '/private', '/System'];

/**
 * Check if a path is potentially dangerous
 */
function isDangerousPath(filePath) {
    const resolved = path.resolve(filePath);
    return DANGEROUS_PATHS.some(dangerous => resolved.startsWith(dangerous));
}

/**
 * Read file contents
 */
async function readFile(filePath) {
    try {
        const resolved = path.resolve(filePath);

        if (!fs.existsSync(resolved)) {
            return { success: false, error: `File not found: ${resolved}` };
        }

        const stats = fs.statSync(resolved);

        if (stats.isDirectory()) {
            return { success: false, error: 'Path is a directory, not a file' };
        }

        if (stats.size > MAX_FILE_SIZE) {
            return {
                success: false,
                error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum: 5MB`
            };
        }

        const content = fs.readFileSync(resolved, 'utf-8');

        return {
            success: true,
            path: resolved,
            content,
            size: stats.size,
            modified: stats.mtime.toISOString()
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Write content to a file
 */
async function writeFile(filePath, content, options = {}) {
    try {
        const resolved = path.resolve(filePath);

        // Safety check for dangerous paths
        if (isDangerousPath(resolved) && !options.force) {
            return {
                success: false,
                error: 'Writing to system directories is not allowed'
            };
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Create backup if file exists and backup option is set
        if (fs.existsSync(resolved) && options.backup) {
            const backupPath = `${resolved}.backup.${Date.now()}`;
            fs.copyFileSync(resolved, backupPath);
        }

        fs.writeFileSync(resolved, content, 'utf-8');

        return {
            success: true,
            path: resolved,
            bytesWritten: Buffer.byteLength(content, 'utf-8'),
            created: !fs.existsSync(resolved)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * List directory contents
 */
async function listDirectory(dirPath, options = {}) {
    try {
        const resolved = path.resolve(dirPath);

        if (!fs.existsSync(resolved)) {
            return { success: false, error: `Directory not found: ${resolved}` };
        }

        const stats = fs.statSync(resolved);
        if (!stats.isDirectory()) {
            return { success: false, error: 'Path is not a directory' };
        }

        const entries = fs.readdirSync(resolved, { withFileTypes: true });

        let items = entries.map(entry => {
            const fullPath = path.join(resolved, entry.name);
            const itemStats = fs.statSync(fullPath);

            return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: entry.isFile() ? itemStats.size : null,
                modified: itemStats.mtime.toISOString(),
                path: fullPath
            };
        });

        // Apply filtering
        if (options.filesOnly) {
            items = items.filter(i => i.type === 'file');
        }
        if (options.dirsOnly) {
            items = items.filter(i => i.type === 'directory');
        }
        if (!options.showHidden) {
            items = items.filter(i => !i.name.startsWith('.'));
        }

        // Limit results
        if (items.length > MAX_FILES_LIST) {
            items = items.slice(0, MAX_FILES_LIST);
        }

        return {
            success: true,
            path: resolved,
            items,
            totalItems: entries.length,
            truncated: entries.length > MAX_FILES_LIST
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Search for files matching a pattern
 */
async function searchFiles(directory, pattern, options = {}) {
    const maxDepth = options.maxDepth || 5;
    const maxResults = options.maxResults || 50;
    const matches = [];

    function createMatcher(pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(regexPattern, 'i');
    }

    function search(dir, depth) {
        if (depth > maxDepth || matches.length >= maxResults) return;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const matcher = createMatcher(pattern);

            for (const entry of entries) {
                if (matches.length >= maxResults) break;

                // Skip hidden files/dirs unless explicitly requested
                if (entry.name.startsWith('.') && !options.includeHidden) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules and other common large dirs
                    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
                    search(fullPath, depth + 1);
                } else if (matcher.test(entry.name)) {
                    matches.push({
                        name: entry.name,
                        path: fullPath,
                        directory: dir
                    });
                }
            }
        } catch (error) {
            // Silently skip directories we can't read
        }
    }

    try {
        const resolved = path.resolve(directory);
        if (!fs.existsSync(resolved)) {
            return { success: false, error: `Directory not found: ${resolved}` };
        }

        search(resolved, 0);

        return {
            success: true,
            pattern,
            directory: resolved,
            matches,
            totalMatches: matches.length,
            truncated: matches.length >= maxResults
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get file info without reading content
 */
async function getFileInfo(filePath) {
    try {
        const resolved = path.resolve(filePath);

        if (!fs.existsSync(resolved)) {
            return { success: false, error: `File not found: ${resolved}` };
        }

        const stats = fs.statSync(resolved);

        return {
            success: true,
            path: resolved,
            name: path.basename(resolved),
            extension: path.extname(resolved),
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            size: stats.size,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            accessed: stats.atime.toISOString()
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    readFile,
    writeFile,
    listDirectory,
    searchFiles,
    getFileInfo,
    isDangerousPath
};
