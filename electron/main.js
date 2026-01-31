const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

const isDev = process.env.NODE_ENV === 'development';
const FRONTEND_PORT = 3002;
const BACKEND_PORT = 3001;

// Get the correct base path for resources
function getResourcePath(relativePath) {
    if (isDev) {
        return path.join(__dirname, '..', relativePath);
    }
    // In production, resources are in the app's resource folder
    return path.join(process.resourcesPath, relativePath);
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

    // Load the app
    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // Production: Load from built Next.js export
        const frontendPath = path.join(__dirname, '..', 'frontend', 'out', 'index.html');
        console.log('Loading frontend from:', frontendPath);
        mainWindow.loadFile(frontendPath);
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

function startBackend() {
    if (isDev) {
        // In dev mode, assume backend is started separately
        console.log('Dev mode: Backend should be started separately');
        return;
    }

    // Production: Start the bundled backend
    const backendPath = path.join(__dirname, '..', 'backend', 'src', 'server.js');
    console.log('Starting backend from:', backendPath);

    backendProcess = spawn(process.execPath.includes('Electron') ? 'node' : process.execPath, [backendPath], {
        env: { ...process.env, PORT: BACKEND_PORT, NODE_ENV: 'production' },
        stdio: 'pipe',
        cwd: path.join(__dirname, '..', 'backend')
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('error', (err) => {
        console.error('Failed to start backend:', err);
    });

    backendProcess.on('exit', (code) => {
        console.log(`Backend exited with code ${code}`);
    });
}

function stopBackend() {
    if (backendProcess) {
        console.log('Stopping backend...');
        backendProcess.kill();
        backendProcess = null;
    }
}

app.whenReady().then(() => {
    startBackend();

    // Delay to let backend start
    setTimeout(createWindow, isDev ? 0 : 1500);

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
