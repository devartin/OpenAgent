const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────
// Single Instance Lock - Prevent multiple app instances
// ─────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
let backendProcess = null;

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;
const FRONTEND_DEV_PORT = 3002;

// ─────────────────────────────────────────────────────────────
// Find System Node.js (NOT Electron binary)
// ─────────────────────────────────────────────────────────────
function findNodePath() {
    const possiblePaths = [
        '/opt/homebrew/bin/node',      // macOS ARM (Homebrew)
        '/usr/local/bin/node',          // macOS Intel (Homebrew)
        '/usr/bin/node',                // Linux
        'C:\\Program Files\\nodejs\\node.exe',  // Windows
    ];

    for (const nodePath of possiblePaths) {
        if (fs.existsSync(nodePath)) {
            return nodePath;
        }
    }

    // Fallback: try to find via which/where
    try {
        const cmd = process.platform === 'win32' ? 'where node' : 'which node';
        const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
        if (result && fs.existsSync(result.split('\n')[0])) {
            return result.split('\n')[0];
        }
    } catch (e) {
        // Ignore
    }

    return 'node'; // Last resort - hope it's in PATH
}

// ─────────────────────────────────────────────────────────────
// Get Resource Paths
// ─────────────────────────────────────────────────────────────
function getAppPath() {
    if (isDev) {
        return path.join(__dirname, '..');
    }
    // In production packaged app
    return path.join(__dirname, '..');
}

// ─────────────────────────────────────────────────────────────
// Create Main Window
// ─────────────────────────────────────────────────────────────
function createWindow() {
    if (mainWindow) {
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#09090b',
        show: false, // Don't show until ready
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    // Show when ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_DEV_PORT}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // Production: Load static HTML from frontend/out
        const htmlPath = path.join(getAppPath(), 'frontend', 'out', 'index.html');

        if (fs.existsSync(htmlPath)) {
            mainWindow.loadFile(htmlPath);
        } else {
            // Fallback error display
            mainWindow.loadURL(`data:text/html,<html><body style="background:#09090b;color:#fff;font-family:system-ui;padding:40px;"><h1>OpenAgent</h1><p>Error: Frontend not found at ${htmlPath}</p><p>Please reinstall the application.</p></body></html>`);
        }
    }

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─────────────────────────────────────────────────────────────
// Start Backend Server
// ─────────────────────────────────────────────────────────────
function startBackend() {
    if (isDev) {
        // In dev mode, backend should be started separately
        return;
    }

    if (backendProcess) {
        return; // Already running
    }

    const nodePath = findNodePath();
    const backendDir = path.join(getAppPath(), 'backend');
    const serverPath = path.join(backendDir, 'src', 'server.js');

    if (!fs.existsSync(serverPath)) {
        console.error('Backend server.js not found at:', serverPath);
        return;
    }

    try {
        backendProcess = spawn(nodePath, [serverPath], {
            env: {
                ...process.env,
                PORT: String(BACKEND_PORT),
                NODE_ENV: 'production'
            },
            cwd: backendDir,
            stdio: ['ignore', 'ignore', 'ignore'], // Silent - no pipes to avoid EPIPE
            detached: false,
            windowsHide: true
        });

        backendProcess.on('error', (err) => {
            console.error('Backend spawn error:', err.message);
            backendProcess = null;
        });

        backendProcess.on('exit', (code) => {
            backendProcess = null;
        });

    } catch (err) {
        console.error('Failed to start backend:', err.message);
        backendProcess = null;
    }
}

// ─────────────────────────────────────────────────────────────
// Stop Backend Server
// ─────────────────────────────────────────────────────────────
function stopBackend() {
    if (backendProcess) {
        try {
            backendProcess.kill('SIGTERM');
        } catch (e) {
            // Ignore
        }
        backendProcess = null;
    }
}

// ─────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────

// Handle second instance attempt
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
    }
});

// App ready
app.whenReady().then(() => {
    // Start backend first
    startBackend();

    // Wait for backend to initialize, then create window
    const delay = isDev ? 0 : 2500;
    setTimeout(createWindow, delay);

    // macOS: Recreate window when dock icon clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// All windows closed
app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Before quit
app.on('before-quit', () => {
    stopBackend();
});

// Will quit
app.on('will-quit', () => {
    stopBackend();
});

// Catch uncaught exceptions silently
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});
