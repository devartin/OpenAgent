const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow;
let backendProcess;

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;

// Find system Node.js installation
function findNodePath() {
    try {
        // Try common locations
        const commonPaths = [
            '/usr/local/bin/node',
            '/opt/homebrew/bin/node',
            '/usr/bin/node'
        ];

        for (const nodePath of commonPaths) {
            if (fs.existsSync(nodePath)) {
                return nodePath;
            }
        }

        // Try which node
        const result = execSync('which node', { encoding: 'utf8' }).trim();
        if (result && fs.existsSync(result)) {
            return result;
        }
    } catch (e) {
        // Fallback
    }
    return 'node'; // Hope it's in PATH
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#09090b',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3002');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // Production: Load from built Next.js export
        const frontendPath = path.join(__dirname, '..', 'frontend', 'out', 'index.html');
        mainWindow.loadFile(frontendPath);
    }

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

function startBackend() {
    if (isDev) {
        return; // Backend started separately in dev
    }

    if (backendProcess) {
        return; // Already running
    }

    const backendPath = path.join(__dirname, '..', 'backend', 'src', 'server.js');
    const nodePath = findNodePath();
    const backendCwd = path.join(__dirname, '..', 'backend');

    try {
        backendProcess = spawn(nodePath, [backendPath], {
            env: {
                ...process.env,
                PORT: String(BACKEND_PORT),
                NODE_ENV: 'production'
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: backendCwd,
            detached: false
        });

        // Silently handle output to avoid EPIPE errors
        if (backendProcess.stdout) {
            backendProcess.stdout.on('data', () => { });
            backendProcess.stdout.on('error', () => { });
        }
        if (backendProcess.stderr) {
            backendProcess.stderr.on('data', () => { });
            backendProcess.stderr.on('error', () => { });
        }

        backendProcess.on('error', () => { });
        backendProcess.on('exit', () => {
            backendProcess = null;
        });

    } catch (err) {
        backendProcess = null;
    }
}

function stopBackend() {
    if (backendProcess) {
        try {
            backendProcess.kill('SIGTERM');
        } catch (e) { }
        backendProcess = null;
    }
}

// Handle second instance
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(() => {
    startBackend();

    // Wait for backend to start
    setTimeout(createWindow, isDev ? 0 : 2000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopBackend();
});

// Catch uncaught exceptions to prevent crash dialogs
process.on('uncaughtException', () => { });
