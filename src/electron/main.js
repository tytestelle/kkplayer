const { app, BrowserWindow, ipcMain, globalShortcut, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 保持窗口对象的全局引用
let mainWindow = null;
let isQuitting = false;

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 480,
    title: 'KU9 Player',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 }
  });

  // 加载应用
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  }

  // 窗口就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // 恢复窗口状态
    const windowState = loadWindowState();
    if (windowState) {
      mainWindow.setBounds(windowState);
      if (windowState.isMaximized) mainWindow.maximize();
      if (windowState.isFullScreen) mainWindow.setFullScreen(true);
    }
  });

  // 窗口关闭处理
  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    } else {
      saveWindowState();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 注册全局快捷键
  registerGlobalShortcuts();

  // 设置应用菜单
  setupApplicationMenu();
}

// 预加载脚本通信
function setupIPC() {
  // 向渲染进程发送消息
  ipcMain.on('to-main', (event, data) => {
    console.log('From renderer:', data);
  });

  // 处理文件打开请求
  ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '播放列表', extensions: ['m3u', 'm3u8', 'txt', 'json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      return { success: true, content, path: result.filePaths[0] };
    }
    return { success: false };
  });

  // 处理文件保存请求
  ipcMain.handle('save-file', async (event, { content, filename }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'JSON配置', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!result.canceled) {
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, path: result.filePath };
    }
    return { success: false };
  });

  // 获取应用版本
  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  // 获取平台信息
  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

  // 退出应用
  ipcMain.on('quit-app', () => {
    isQuitting = true;
    app.quit();
  });

  // 最小化到托盘
  ipcMain.on('minimize-to-tray', () => {
    if (mainWindow) mainWindow.hide();
  });
}

// 全局快捷键
function registerGlobalShortcuts() {
  // 媒体键支持
  globalShortcut.register('MediaPlayPause', () => {
    sendToRenderer({ type: 'shortcut', action: 'play' });
  });

  globalShortcut.register('MediaNextTrack', () => {
    sendToRenderer({ type: 'shortcut', action: 'next' });
  });

  globalShortcut.register('MediaPreviousTrack', () => {
    sendToRenderer({ type: 'shortcut', action: 'prev' });
  });

  globalShortcut.register('MediaStop', () => {
    sendToRenderer({ type: 'shortcut', action: 'pause' });
  });
}

function sendToRenderer(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('from-main', data);
  }
}

// 应用菜单
function setupApplicationMenu() {
  const template = [
    {
      label: 'KU9 Player',
      submenu: [
        { label: '关于 KU9 Player', role: 'about' },
        { type: 'separator' },
        { label: '偏好设置...', accelerator: 'CmdOrCtrl+,', click: () => {
          sendToRenderer({ type: 'shortcut', action: 'settings' });
        }},
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => {
          isQuitting = true;
          app.quit();
        }}
      ]
    },
    {
      label: '播放',
      submenu: [
        { label: '播放/暂停', accelerator: 'Space', click: () => sendToRenderer({ type: 'shortcut', action: 'play' }) },
        { label: '上一个频道', accelerator: 'Up', click: () => sendToRenderer({ type: 'shortcut', action: 'prev' }) },
        { label: '下一个频道', accelerator: 'Down', click: () => sendToRenderer({ type: 'shortcut', action: 'next' }) },
        { type: 'separator' },
        { label: '静音', accelerator: 'M', click: () => sendToRenderer({ type: 'shortcut', action: 'mute' }) },
        { label: '全屏', accelerator: 'F', click: () => {
          if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }}
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => {
          if (mainWindow) mainWindow.webContents.reload();
        }},
        { label: '开发者工具', accelerator: 'F12', click: () => {
          if (mainWindow) mainWindow.webContents.toggleDevTools();
        }},
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => {
          if (mainWindow) mainWindow.webContents.setZoomLevel(0);
        }},
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', click: () => {
          if (mainWindow) mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 1);
        }},
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => {
          if (mainWindow) mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 1);
        }}
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 窗口状态持久化
function loadWindowState() {
  try {
    const statePath = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
  } catch (e) {
    console.error('加载窗口状态失败:', e);
  }
  return null;
}

function saveWindowState() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    const state = {
      ...bounds,
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen()
    };
    const statePath = path.join(app.getPath('userData'), 'window-state.json');
    fs.writeFileSync(statePath, JSON.stringify(state), 'utf-8');
  } catch (e) {
    console.error('保存窗口状态失败:', e);
  }
}

// 应用生命周期
app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowState();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 安全策略：阻止新窗口打开
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    console.log('阻止打开新窗口:', navigationUrl);
  });

  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== new URL(contents.getURL()).origin) {
      event.preventDefault();
      console.log('阻止导航到:', navigationUrl);
    }
  });
});
