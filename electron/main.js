const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');

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
// Get Resource Paths (Production vs Development)
// ─────────────────────────────────────────────────────────────
function getResourcePath(...segments) {
    if (isDev) {
        return path.join(__dirname, '..', ...segments);
    }
    // In production: resources are in app.asar or unpacked alongside
    // Since asar is disabled, files are directly in the app directory
    return path.join(process.resourcesPath, '..', ...segments);
}

function getAppPath() {
    if (isDev) {
        return path.join(__dirname, '..');
    }
    // Production: app contents are in Resources/app
    return path.join(process.resourcesPath, 'app');
}

function getBackendPath() {
    if (isDev) {
        return path.join(__dirname, '..', 'backend');
    }
    // Production: backend is in Resources/app/backend
    return path.join(process.resourcesPath, 'app', 'backend');
}

function getBackendNodeModulesPath() {
    if (isDev) {
        return path.join(__dirname, '..', 'backend', 'node_modules');
    }
    // Production: extraResources copies node_modules to Resources/backend/node_modules
    return path.join(process.resourcesPath, 'backend', 'node_modules');
}

// ─────────────────────────────────────────────────────────────
// Find System Node.js
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
            console.log('Found Node.js at:', nodePath);
            return nodePath;
        }
    }

    // Fallback: try to find via which/where
    try {
        const cmd = process.platform === 'win32' ? 'where node' : 'which node';
        const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
        if (result && fs.existsSync(result.split('\n')[0])) {
            console.log('Found Node.js via PATH:', result.split('\n')[0]);
            return result.split('\n')[0];
        }
    } catch (e) {
        console.log('Could not find Node.js via PATH');
    }

    return null;
}

// ─────────────────────────────────────────────────────────────
// Check if backend is running
// ─────────────────────────────────────────────────────────────
function checkBackendHealth() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// ─────────────────────────────────────────────────────────────
// Wait for backend to be ready
// ─────────────────────────────────────────────────────────────
async function waitForBackend(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const isReady = await checkBackendHealth();
        if (isReady) {
            console.log('Backend is ready!');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('Backend did not start in time');
    return false;
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
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_DEV_PORT}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // Production: Load static HTML from frontend/out
        const appDir = getAppPath();
        const htmlPath = path.join(appDir, 'frontend', 'out', 'index.html');

        console.log('Loading frontend from:', htmlPath);
        console.log('App directory:', appDir);

        if (fs.existsSync(htmlPath)) {
            mainWindow.loadFile(htmlPath);
        } else {
            // Show error with diagnostic info
            const errorHtml = `
                <html>
                <body style="background:#09090b;color:#fff;font-family:system-ui;padding:40px;">
                    <h1>OpenAgent</h1>
                    <p style="color:#ff6b6b;">Error: Frontend not found</p>
                    <p style="color:#888;font-size:12px;">Expected at: ${htmlPath}</p>
                    <p style="color:#888;font-size:12px;">App dir: ${appDir}</p>
                    <p style="color:#888;font-size:12px;">Resources: ${process.resourcesPath}</p>
                    <p style="margin-top:20px;">Please reinstall the application.</p>
                </body>
                </html>
            `;
            mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
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
async function startBackend() {
    if (isDev) {
        // In dev mode, backend started separately
        return true;
    }

    if (backendProcess) {
        return true;
    }

    const nodePath = findNodePath();
    if (!nodePath) {
        dialog.showErrorBox(
            'Node.js Required',
            'OpenAgent requires Node.js to be installed.\n\nPlease install Node.js from https://nodejs.org and restart the application.'
        );
        app.quit();
        return false;
    }

    const backendDir = getBackendPath();
    const serverPath = path.join(backendDir, 'src', 'server.js');
    const nodeModulesPath = getBackendNodeModulesPath();

    console.log('Starting backend...');
    console.log('  Node path:', nodePath);
    console.log('  Backend dir:', backendDir);
    console.log('  Server path:', serverPath);
    console.log('  Node modules:', nodeModulesPath);

    if (!fs.existsSync(serverPath)) {
        console.error('Backend server.js not found at:', serverPath);
        dialog.showErrorBox(
            'Backend Not Found',
            `Could not find the backend server.\n\nExpected at: ${serverPath}\n\nPlease reinstall the application.`
        );
        return false;
    }

    try {
        // Set NODE_PATH so require() can find modules from extraResources
        const env = {
            ...process.env,
            PORT: String(BACKEND_PORT),
            NODE_ENV: 'production',
            NODE_PATH: nodeModulesPath
        };

        backendProcess = spawn(nodePath, [serverPath], {
            env,
            cwd: backendDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });

        backendProcess.stdout.on('data', (data) => {
            console.log('[Backend]', data.toString().trim());
        });

        backendProcess.stderr.on('data', (data) => {
            console.error('[Backend Error]', data.toString().trim());
        });

        backendProcess.on('error', (err) => {
            console.error('Backend spawn error:', err.message);
            backendProcess = null;
        });

        backendProcess.on('exit', (code) => {
            console.log('Backend exited with code:', code);
            backendProcess = null;
        });

        // Wait for backend to be ready
        const isReady = await waitForBackend();
        return isReady;

    } catch (err) {
        console.error('Failed to start backend:', err.message);
        backendProcess = null;
        return false;
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
app.whenReady().then(async () => {
    console.log('App ready. isDev:', isDev);
    console.log('Resources path:', process.resourcesPath);

    // Start backend first
    const backendStarted = await startBackend();

    if (!backendStarted && !isDev) {
        // Show warning but continue - user might have backend running externally
        console.warn('Backend may not have started, continuing anyway...');
    }

    createWindow();

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
