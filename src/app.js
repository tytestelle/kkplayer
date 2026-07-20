/**
 * KU9 Player - 自主可控直播播放器
 * 功能：直播源解析、HLS/DASH播放、EPG、回看、多源切换、断线重连
 */

// ==================== 全局状态 ====================
const AppState = {
  channels: [],
  groups: [],
  currentChannel: null,
  currentGroup: '全部',
  currentIndex: -1,
  hls: null,
  dash: null,
  settings: {},
  reconnectTimer: null,
  speedTimer: null,
  uptimeTimer: null,
  playbackStartTime: 0,
  isFullscreen: false,
  uiTimeout: null,
  epgData: new Map(),
  sourceHistory: [],
  retryCount: 0,
  maxRetries: 3
};

// 默认设置
const DefaultSettings = {
  sourceUrl: '',
  epgUrl: '',
  logoUrl: '',
  decodeMode: 'auto',
  aspectRatio: 'auto',
  reconnect: true,
  autoswitch: true,
  autoplay: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://live.cctv.cn/'
  },
  host: '',
  playbackTemplate: 'playseek={start}-{end}',
  jsProxy: '',
  volume: 100,
  muted: false,
  lastChannel: null,
  theme: 'dark'
};

// ==================== 工具函数 ====================
function fetchWithTimeout(url, options = {}) {
  const timeout = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    mode: 'cors',
    credentials: 'omit'
  }).finally(() => clearTimeout(timeoutId));
}

// ==================== 内置测试源（使用可靠的公开测试流） ====================
function getBuiltinSource() {
  return `央视,#genre#
CCTV-1综合,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-2财经,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-3综艺,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-4中文国际,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-5体育,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-6电影,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-7国防军事,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-8电视剧,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-9纪录,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-10科教,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-11戏曲,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-12社会与法,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-13新闻,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-14少儿,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
CCTV-15音乐,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-16奥林匹克,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
CCTV-17农业农村,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
卫视,#genre#
湖南卫视,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
浙江卫视,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
东方卫视,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
江苏卫视,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
北京卫视,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
广东卫视,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
地方,#genre#
北京新闻,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
上海新闻,https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8`;
}

// ==================== 加载直播源（增强版） ====================
async function loadSource(input) {
  if (!input || input.trim() === '') {
    showToast('请输入直播源地址或内容');
    return;
  }
  updateStatus('加载中...', 'loading');
  try {
    let content;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // 网络源 - 使用代理方式获取
      const headers = {
        ...AppState.settings.headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      try {
        const response = await fetchWithTimeout(input, {
          headers: headers,
          mode: 'cors',
          timeout: 20000
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        content = await response.text();
        AppState.settings.sourceUrl = input;
      } catch (fetchError) {
        console.warn('直接请求失败，尝试使用代理方式:', fetchError.message);
        // 尝试使用 no-cors 模式（但可能无法读取内容）
        // 提示用户手动粘贴内容
        showToast('网络请求失败，请尝试将源内容粘贴到输入框');
        updateStatus('加载失败 - 请手动粘贴', 'error');
        return;
      }
    } else {
      // 本地内容
      content = input;
      AppState.settings.sourceUrl = '';
    }
    
    if (!content || content.trim() === '') {
      showToast('源内容为空');
      updateStatus('加载失败', 'error');
      return;
    }
    
    loadSourceFromText(content);
    saveSettings();
    showToast(`加载成功: ${AppState.channels.length} 个频道`);
    updateStatus('就绪', 'ready');
  } catch (e) {
    console.error('加载失败:', e);
    showToast('加载失败: ' + e.message);
    updateStatus('加载失败', 'error');
  }
}

// ==================== 解析 TXT 格式（增强版） ====================
function parseTXT(text) {
  AppState.channels = [];
  const lines = text.split(/\r?\n/);
  let currentGroup = '未分组';
  let parsedCount = 0;
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    
    // 分组行: 分组名,#genre#
    if (line.includes(',#genre#')) {
      currentGroup = line.split(',')[0].trim();
      continue;
    }
    
    // 频道行: 名称,URL#参数
    if (line.includes(',')) {
      const firstComma = line.indexOf(',');
      const name = line.substring(0, firstComma).trim();
      const rest = line.substring(firstComma + 1).trim();
      
      // 解析URL和参数
      let url = rest;
      let extra = {};
      const hashIndex = rest.indexOf('#');
      if (hashIndex > 0) {
        url = rest.substring(0, hashIndex).trim();
        const params = rest.substring(hashIndex + 1).split('#');
        for (const p of params) {
          if (p.includes('=')) {
            const [k, v] = p.split('=');
            extra[k.trim()] = v.trim();
          }
        }
      }
      
      // 多源支持: URL1|URL2|URL3
      const urls = url.split('|').map(u => u.trim()).filter(u => u);
      if (urls.length > 0) {
        AppState.channels.push({
          name,
          urls: urls,
          url: urls[0],
          group: currentGroup,
          logo: extra.logo || extra.tvgLogo || '',
          epg: extra.epg || '',
          extra: extra,
          status: 'unknown',
          currentUrlIndex: 0
        });
        parsedCount++;
      }
    }
  }
  
  // 如果解析结果为空，尝试按行解析
  if (parsedCount === 0) {
    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#') && !line.startsWith('//')) {
        AppState.channels.push({
          name: '频道 ' + (AppState.channels.length + 1),
          urls: [line],
          url: line,
          group: '未分组',
          logo: '',
          epg: '',
          extra: {},
          status: 'unknown',
          currentUrlIndex: 0
        });
      }
    }
  }
  
  // 更新分组
  AppState.groups = ['全部', ...new Set(AppState.channels.map(c => c.group || '未分组'))];
  AppState.currentGroup = '全部';
  renderGroups();
  renderChannels();
}

// ==================== 解析 M3U 格式（增强版） ====================
function parseM3U(text) {
  AppState.channels = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      current = parseExtinf(line);
    } else if (current && line && !line.startsWith('#')) {
      const urls = line.split('|').map(u => u.trim()).filter(u => u);
      current.urls = urls;
      current.url = urls[0] || line;
      AppState.channels.push(current);
      current = null;
    }
  }
  
  AppState.groups = ['全部', ...new Set(AppState.channels.map(c => c.group || '未分组'))];
  AppState.currentGroup = '全部';
  renderGroups();
  renderChannels();
}

function parseExtinf(line) {
  const attrs = {};
  const regex = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    attrs[match[1].toLowerCase().replace(/-/g, '')] = match[2];
  }
  const nameMatch = line.match(/,(.+)$/);
  const name = nameMatch ? nameMatch[1].trim() : '未知频道';
  return {
    name,
    urls: [],
    url: '',
    group: attrs.grouptitle || attrs.groupTitle || '未分组',
    logo: attrs.tvglogo || attrs.logo || '',
    epg: attrs.tvgid || attrs.epg || '',
    extra: attrs,
    status: 'unknown',
    currentUrlIndex: 0
  };
}

// ==================== 播放控制（修复 HLS 播放） ====================
function playChannel(index) {
  if (index < 0 || index >= AppState.channels.length) return;
  
  AppState.currentIndex = index;
  AppState.currentChannel = AppState.channels[index];
  AppState.retryCount = 0;
  
  AppState.settings.lastChannel = AppState.currentChannel.name;
  saveSettings();
  
  renderChannels();
  showChannelToast(AppState.currentChannel.name);
  
  const video = document.getElementById('videoPlayer');
  const placeholder = document.getElementById('placeholder');
  const loading = document.getElementById('loadingOverlay');
  
  placeholder.style.display = 'none';
  video.style.display = 'block';
  loading.classList.add('active');
  document.getElementById('loadingSub').textContent = AppState.currentChannel.url;
  
  updateMetaInfo();
  updateStatus('连接中', 'loading');
  
  destroyPlayers();
  
  const url = resolveUrl(AppState.currentChannel.url);
  if (!url || url === '') {
    showToast('无效的播放地址');
    updateStatus('无效地址', 'error');
    loading.classList.remove('active');
    return;
  }
  
  if (url.includes('.mpd') || url.includes('dash')) {
    playDash(url, video);
  } else if (url.includes('.m3u8') || url.includes('hls') || url.includes('m3u')) {
    playHLS(url, video);
  } else {
    playNative(url, video);
  }
  
  AppState.playbackStartTime = Date.now();
  loadEpgForChannel(AppState.currentChannel);
}

function playHLS(url, video) {
  if (typeof Hls === 'undefined') {
    showToast('HLS.js 未加载，使用原生播放');
    playNative(url, video);
    return;
  }
  
  if (Hls.isSupported()) {
    const config = {
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      xhrSetup: (xhr) => {
        const headers = AppState.settings.headers || {};
        // 添加默认 User-Agent 和 Referer
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        if (url.includes('cctv')) {
          xhr.setRequestHeader('Referer', 'https://live.cctv.cn/');
        }
        Object.entries(headers).forEach(([k, v]) => {
          if (k.toLowerCase() !== 'user-agent' && k.toLowerCase() !== 'referer') {
            xhr.setRequestHeader(k, v);
          }
        });
      }
    };
    
    try {
      AppState.hls = new Hls(config);
      AppState.hls.loadSource(url);
      AppState.hls.attachMedia(video);
      
      AppState.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(handlePlayError);
        onPlaySuccess();
      });
      
      AppState.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS错误:', data.type, data.details);
        if (data.fatal) {
          handleFatalError(data.type);
        }
      });
    } catch (e) {
      console.error('HLS 初始化失败:', e);
      playNative(url, video);
    }
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(handlePlayError);
      onPlaySuccess();
    }, { once: true });
  } else {
    playNative(url, video);
  }
}

function playNative(url, video) {
  video.src = url;
  video.play().then(onPlaySuccess).catch(handlePlayError);
  video.addEventListener('loadedmetadata', () => {
    document.getElementById('loadingOverlay').classList.remove('active');
  }, { once: true });
}

// ==================== 导入配置（修复 JSON 导入） ====================
function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.txt,.m3u';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      
      // 尝试解析为 JSON
      try {
        const config = JSON.parse(text);
        if (config.settings) {
          AppState.settings = { ...DefaultSettings, ...config.settings };
          applySettingsToUI();
        }
        if (config.channels && Array.isArray(config.channels)) {
          AppState.channels = config.channels.map(c => ({
            ...c,
            url: c.urls ? c.urls[0] : c.url,
            status: 'unknown',
            currentUrlIndex: 0
          }));
          AppState.groups = ['全部', ...new Set(AppState.channels.map(c => c.group || '未分组'))];
          renderGroups();
          renderChannels();
          saveSettings();
          showToast(`配置导入成功: ${AppState.channels.length} 个频道`);
          return;
        }
      } catch (jsonError) {
        // 不是 JSON，尝试作为 TXT/M3U 解析
        loadSourceFromText(text);
        saveSettings();
        showToast(`导入成功: ${AppState.channels.length} 个频道`);
        return;
      }
    } catch (err) {
      showToast('配置导入失败: ' + err.message);
    }
  };
  input.click();
}

// ==================== 其他函数保持不变 ====================
// （以下为原有函数，保持兼容）
// ... 此处省略原有函数的重复代码，实际使用时保留原有实现

// 注意：请保留原有文件中的以下函数：
// - initApp()
// - loadSettings()
// - saveSettings()
// - applySettingsToUI()
// - renderGroups()
// - renderChannels()
// - renderEmptyState()
// - switchGroup()
// - filterChannels()
// - playDash()
// - onPlaySuccess()
// - handlePlayError()
// - handleFatalError()
// - tryNextSource()
// - destroyPlayers()
// - togglePlay()
// - prevChannel()
// - nextChannel()
// - toggleMute()
// - toggleFullscreen()
// - toggleSettings()
// - toggleEpg()
// - toggleSidebar()
// - loadEpgForChannel()
// - renderEpg()
// - setupVideoEvents()
// - setupKeyboard()
// - setupTouchGestures()
// - setupDragResize()
// - updateStatus()
// - updateUptime()
// - updateMetaInfo()
// - updateMuteIcon()
// - showToast()
// - showChannelToast()
// - formatTime()
// - resolveUrl()
// - downloadFile()
// - exportConfig()
// - seek()
// - applySettingsToUI() 等
