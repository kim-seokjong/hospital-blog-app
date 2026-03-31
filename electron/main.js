const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let nextProcess;
const PORT = 3721;
const IS_DEV = !app.isPackaged;

const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {}
  return { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' };
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function waitForServer(retries = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const check = () => {
      http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode < 500) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (++n >= retries) return reject(new Error('서버 시작 실패'));
      setTimeout(check, 1000);
    };
    setTimeout(check, 800);
  });
}

function startProductionServer() {
  const root = path.join(process.resourcesPath, 'app');
  const config = loadConfig();
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: config.OPENAI_API_KEY || '',
    PORT: String(PORT),
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
  };

  const serverScript = path.join(root, '.next', 'standalone', 'server.js');
  nextProcess = spawn(process.execPath, [serverScript], {
    cwd: path.join(root, '.next', 'standalone'),
    env,
    windowsHide: true,
  });

  nextProcess.stdout?.on('data', (d) => console.log('[Next]', d.toString().trim()));
  nextProcess.stderr?.on('data', (d) => console.error('[Next ERR]', d.toString().trim()));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: '병원 블로그 자동화',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#eff6ff',
  });

  const menu = Menu.buildFromTemplate([
    {
      label: '설정',
      submenu: [
        { label: '🔑 API 키 설정', click: () => mainWindow?.loadFile(path.join(__dirname, 'setup.html')) },
        { type: 'separator' },
        { label: '🔧 개발자 도구', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: '❌ 종료', role: 'quit' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '새로고침', accelerator: 'F5', click: () => mainWindow?.reload() },
        { label: '확대', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5) },
        { label: '축소', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5) },
        { label: '기본 크기', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.setZoomLevel(0) },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.show();

  const config = loadConfig();
  if (!config.ANTHROPIC_API_KEY || !config.OPENAI_API_KEY) {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }

  try {
    // 개발 모드: concurrently가 이미 Next.js를 실행 중 → 그냥 연결
    // 패키지 모드: standalone 서버 직접 실행
    if (!IS_DEV) startProductionServer();

    await waitForServer();
    mainWindow.loadURL(`http://localhost:${PORT}`);
  } catch (e) {
    console.error(e);
    mainWindow.loadFile(path.join(__dirname, 'error.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  nextProcess?.kill();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', async (_, config) => {
  saveConfig(config);
  if (!IS_DEV) {
    nextProcess?.kill();
    nextProcess = null;
    mainWindow?.loadFile(path.join(__dirname, 'loading.html'));
    try {
      startProductionServer();
      await waitForServer();
      mainWindow?.loadURL(`http://localhost:${PORT}`);
    } catch {
      mainWindow?.loadFile(path.join(__dirname, 'error.html'));
    }
  } else {
    mainWindow?.loadURL(`http://localhost:${PORT}`);
  }
  return { success: true };
});
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
