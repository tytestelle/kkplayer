# KU9 Player 🔓

> **完全自主可控的直播播放器** — 兼容酷9格式，支持桌面端(Windows/macOS/Linux)和移动端(Android)打包。

[![Build Electron](https://github.com/yourusername/ku9-player/actions/workflows/build-electron.yml/badge.svg)](https://github.com/yourusername/ku9-player/actions/workflows/build-electron.yml)
[![Build Android](https://github.com/yourusername/ku9-player/actions/workflows/build-android.yml/badge.svg)](https://github.com/yourusername/ku9-player/actions/workflows/build-android.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📡 **直播源管理** | 支持TXT/M3U格式，网络URL/本地文件/粘贴内容 |
| 🎬 **多协议播放** | HLS/M3U8、DASH/MPD、MP4、FLV 原生支持 |
| 📋 **EPG节目单** | 兼容DIYP/百川/XMLTV格式，7天回看，24小时时移 |
| 🔄 **多源切换** | 单频道多源备份，自动故障切换 |
| 🔌 **断线重连** | 网络中断自动恢复，可配置重试策略 |
| 🎮 **遥控支持** | 完整键盘快捷键，Android TV遥控器适配 |
| 🔧 **高级配置** | 自定义Headers、Host映射、JS代理、回看模板 |
| 💾 **配置迁移** | JSON格式导入导出，LocalStorage本地持久化 |
| 🖥️ **桌面端** | Windows EXE / macOS DMG / Linux AppImage & DEB |
| 📱 **移动端** | Android APK/AAB，电视盒子/TV全适配 |

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/yourusername/ku9-player.git
cd ku9-player
```

### 2. 安装依赖

```bash
# 安装所有依赖（根目录 + electron）
npm run install:all

# 或分别安装
npm install
cd electron && npm install
```

### 3. 运行开发版本

```bash
# Web浏览器版本
npm run dev:web

# Electron桌面版本
npm run dev:electron

# Android（需先同步）
npm run cap:sync
npm run cap:open:android
```

---

## 📦 打包构建

### 桌面端 (Electron)

```bash
# 构建全部平台
npm run build:electron

# 单独构建
npm run build:electron:win      # Windows .exe + .zip
npm run build:electron:mac      # macOS .dmg + .zip
npm run build:electron:linux    # Linux .AppImage + .deb
```

输出目录：`dist/electron/`

### 移动端 (Android)

```bash
# 同步Capacitor资源
npm run cap:sync

# 构建Debug APK
npm run build:android:debug

# 构建Release APK（需要签名配置）
npm run build:android
```

输出目录：`android/app/build/outputs/apk/`

---

## ⚙️ GitHub Actions 自动打包

本项目已配置完整的CI/CD工作流，**推送到GitHub后自动构建**：

### 触发方式

1. **推送到 `main` 分支** → 构建并上传Artifacts
2. **推送 `v*` 标签** → 构建 + 自动创建GitHub Release
3. **手动触发** → `Actions` 页面点击 `Run workflow`

### 配置签名（Android Release）

在仓库 `Settings → Secrets and variables → Actions` 中添加：

| Secret | 说明 |
|--------|------|
| `KEYSTORE_PASSWORD` | 密钥库密码 |
| `KEY_ALIAS` | 密钥别名 |
| `KEY_PASSWORD` | 密钥密码 |

并上传 `keystore.jks` 到 `android/app/` 目录（不要在Git中提交！）。

---

## 🎮 快捷键

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 上一个/下一个频道 |
| `←` / `→` | 快退/快进 10秒 |
| `Space` / `K` | 播放/暂停 |
| `M` | 静音 |
| `F` | 全屏 |
| `S` | 设置面板 |
| `E` | EPG节目单 |
| `L` | 频道列表 |
| `0-9` | 快速切换频道 |
| `Esc` | 退出全屏/关闭面板 |

---

## 📁 项目结构

```
ku9-player/
├── src/                      # Web核心源码
│   ├── index.html            # 主页面
│   ├── styles.css            # 样式
│   └── app.js                # 核心逻辑
├── electron/                 # Electron桌面端
│   ├── main.js               # 主进程
│   ├── preload.js            # 预加载脚本
│   └── package.json          # Electron依赖
├── android/                  # Android项目
│   └── app/                  # 应用源码
├── .github/workflows/        # CI/CD工作流
│   ├── build-electron.yml    # 桌面端打包
│   └── build-android.yml     # 移动端打包
├── capacitor.config.json     # Capacitor配置
├── package.json              # 根项目配置
└── README.md
```

---

## 🔧 自主可控说明

本播放器**完全自主可控**，所有配置本地存储：

- ✅ **无云端依赖** — 所有数据保存在本地 LocalStorage
- ✅ **开源透明** — 纯 HTML/CSS/JS，代码完全可审计
- ✅ **配置自主** — 直播源、EPG、Headers、JS代理全部自己掌控
- ✅ **数据可迁移** — 支持导出/导入JSON配置文件
- ✅ **隐私安全** — 不上传任何观看记录或个人信息

---

## 📝 直播源格式

### TXT 格式（兼容酷9）

```
分组名,#genre#
频道名称,http://example.com/live.m3u8#key1=value1#key2=value2
频道名称,http://example.com/live.m3u8|备用源1|备用源2
```

### M3U 格式

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="CCTV1" tvg-logo="https://example.com/cctv1.png" group-title="央视",CCTV-1综合
http://example.com/cctv1.m3u8
```

---

## 📄 开源协议

[MIT License](LICENSE) © 2024 KU9 Team

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request
