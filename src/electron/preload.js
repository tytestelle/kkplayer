const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 发送消息到主进程
  send: (channel, data) => {
    const validChannels = ['to-main', 'quit-app', 'minimize-to-tray'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // 调用主进程方法
  invoke: (channel, data) => {
    const validChannels = ['open-file', 'save-file', 'get-version', 'get-platform'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error('Invalid channel'));
  },

  // 接收主进程消息
  onMessage: (callback) => {
    ipcRenderer.on('from-main', (event, data) => callback(data));
  },

  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // 平台信息
  platform: process.platform,

  // 版本信息
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
});
