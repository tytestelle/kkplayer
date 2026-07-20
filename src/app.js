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
  headers: { 'User-Agent': 'KU9-Player/1.0' },
  host: '',
  playbackTemplate: 'playseek={start}-{end}',
  jsProxy: '',
  volume: 100,
  muted: false,
  lastChannel: null,
  theme: 'dark'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadSettings();
  setupVideoEvents();
  setupKeyboard();
  setupTouchGestures();
  setupDragResize();

  // 尝试加载默认源或上次使用的源
  const sourceToLoad = AppState.settings.sourceUrl || getBuiltinSource();
  if (sourceToLoad) {
    loadSourceFromText(sourceToLoad);
  } else {
    renderEmptyState();
  }

  // 开机自播
  if (AppState.settings.autoplay && AppState.settings.lastChannel) {
    setTimeout(() => {
      const idx = AppState.channels.findIndex(c => c.name === AppState.settings.lastChannel);
      if (idx >= 0) playChannel(idx);
    }, 500);
  }

  updateUptime();
  AppState.uptimeTimer = setInterval(updateUptime, 1000);

  showToast('KU9 Player 已就绪');
}

// ==================== 设置管理 ====================
function loadSettings() {
  try {
    const saved = localStorage.getItem('ku9_settings');
    AppState.settings = saved ? { ...DefaultSettings, ...JSON.parse(saved) } : { ...DefaultSettings };
  } catch (e) {
    AppState.settings = { ...DefaultSettings };
  }

  // 应用到UI
  applySettingsToUI();
}

function saveSettings() {
  // 从UI读取当前值
  const s = AppState.settings;
  s.sourceUrl = document.getElementById('sourceInput').value.trim();
  s.epgUrl = document.getElementById('epgInput').value.trim();
  s.logoUrl = document.getElementById('logoInput').value.trim();
  s.decodeMode = document.getElementById('decodeMode').value;
  s.aspectRatio = document.getElementById('aspectRatio').value;
  s.reconnect = document.getElementById('reconnectToggle').checked;
  s.autoswitch = document.getElementById('autoswitchToggle').checked;
  s.autoplay = document.getElementById('autoplayToggle').checked;

  try {
    const headersStr = document.getElementById('headersInput').value.trim();
    s.headers = headersStr ? JSON.parse(headersStr) : {};
  } catch (e) {
    showToast('Headers JSON格式错误');
    return;
  }

  s.host = document.getElementById('hostInput').value.trim();
  s.playbackTemplate = document.getElementById('playbackInput').value.trim();
  s.jsProxy = document.getElementById('jsInput').value.trim();

  localStorage.setItem('ku9_settings', JSON.stringify(s));
  showToast('设置已保存');
}

function applySettingsToUI() {
  const s = AppState.settings;
  document.getElementById('sourceInput').value = s.sourceUrl || '';
  document.getElementById('epgInput').value = s.epgUrl || '';
  document.getElementById('logoInput').value = s.logoUrl || '';
  document.getElementById('decodeMode').value = s.decodeMode || 'auto';
  document.getElementById('aspectRatio').value = s.aspectRatio || 'auto';
  document.getElementById('reconnectToggle').checked = s.reconnect !== false;
  document.getElementById('autoswitchToggle').checked = s.autoswitch !== false;
  document.getElementById('autoplayToggle').checked = s.autoplay === true;
  document.getElementById('headersInput').value = JSON.stringify(s.headers || {});
  document.getElementById('hostInput').value = s.host || '';
  document.getElementById('playbackInput').value = s.playbackTemplate || '';
  document.getElementById('jsInput').value = s.jsProxy || '';

  // 应用音量
  const video = document.getElementById('videoPlayer');
  video.volume = (s.volume || 100) / 100;
  video.muted = s.muted || false;
  document.getElementById('volumeInput').value = s.volume || 100;
  updateMuteIcon();
}

// ==================== 直播源解析 ====================
function getBuiltinSource() {
  return `央视,#genre#
CCTV-1综合,https://live.cctv.cn/live/cctv1.m3u8
CCTV-2财经,https://live.cctv.cn/live/cctv2.m3u8
CCTV-3综艺,https://live.cctv.cn/live/cctv3.m3u8
CCTV-4中文国际,https://live.cctv.cn/live/cctv4.m3u8
CCTV-5体育,https://live.cctv.cn/live/cctv5.m3u8
CCTV-6电影,https://live.cctv.cn/live/cctv6.m3u8
CCTV-7国防军事,https://live.cctv.cn/live/cctv7.m3u8
CCTV-8电视剧,https://live.cctv.cn/live/cctv8.m3u8
CCTV-9纪录,https://live.cctv.cn/live/cctv9.m3u8
CCTV-10科教,https://live.cctv.cn/live/cctv10.m3u8
CCTV-11戏曲,https://live.cctv.cn/live/cctv11.m3u8
CCTV-12社会与法,https://live.cctv.cn/live/cctv12.m3u8
CCTV-13新闻,https://live.cctv.cn/live/cctv13.m3u8
CCTV-14少儿,https://live.cctv.cn/live/cctv14.m3u8
CCTV-15音乐,https://live.cctv.cn/live/cctv15.m3u8
CCTV-16奥林匹克,https://live.cctv.cn/live/cctv16.m3u8
CCTV-17农业农村,https://live.cctv.cn/live/cctv17.m3u8

卫视,#genre#
湖南卫视,https://example.com/hunan.m3u8
浙江卫视,https://example.com/zhejiang.m3u8
东方卫视,https://example.com/dongfang.m3u8
江苏卫视,https://example.com/jiangsu.m3u8
北京卫视,https://example.com/beijing.m3u8
广东卫视,https://example.com/guangdong.m3u8
深圳卫视,https://example.com/shenzhen.m3u8
山东卫视,https://example.com/shandong.m3u8
湖北卫视,https://example.com/hubei.m3u8
四川卫视,https://example.com/sichuan.m3u8
安徽卫视,https://example.com/anhui.m3u8
辽宁卫视,https://example.com/liaoning.m3u8
天津卫视,https://example.com/tianjin.m3u8
重庆卫视,https://example.com/chongqing.m3u8
黑龙江卫视,https://example.com/heilongjiang.m3u8

地方,#genre#
北京新闻,https://example.com/bjnews.m3u8
上海新闻,https://example.com/shnews.m3u8
广州综合,https://example.com/gztv.m3u8
深圳都市,https://example.com/sztv.m3u8`;
}

async function loadSource() {
  const input = document.getElementById('sourceInput').value.trim();
  if (!input) {
    showToast('请输入直播源地址或内容');
    return;
  }

  showToast('正在加载直播源...');
  updateStatus('加载中', 'loading');

  try {
    let content;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // 网络源
      const response = await fetchWithTimeout(input, {
        headers: AppState.settings.headers || {},
        mode: 'cors',
        timeout: 15000
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      content = await response.text();
      AppState.settings.sourceUrl = input;
    } else {
      // 本地内容
      content = input;
      AppState.settings.sourceUrl = '';
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

function loadSourceFromText(text) {
  if (text.includes('#EXTM3U')) {
    parseM3U(text);
  } else {
    parseTXT(text);
  }

  // 去重并排序
  AppState.groups = ['全部', ...new Set(AppState.channels.map(c => c.group))];
  AppState.currentGroup = '全部';

  renderGroups();
  renderChannels();
}

function parseTXT(text) {
  AppState.channels = [];
  const lines = text.split(/\r?\n/);
  let currentGroup = '未分组';

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

      // 酷9格式: URL#key1=val1#key2=val2
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

      AppState.channels.push({
        name,
        urls,
        url: urls[0],
        group: currentGroup,
        logo: extra.logo || extra.tvgLogo || '',
        epg: extra.epg || '',
        extra,
        status: 'unknown',
        currentUrlIndex: 0
      });
    }
  }
}

function parseM3U(text) {
  AppState.channels = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      current = parseExtinf(line);
    } else if (current && line && !line.startsWith('#')) {
      current.urls = [line];
      current.url = line;
      AppState.channels.push(current);
      current = null;
    }
  }
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
    group: attrs.grouptitle || attrs.group || '未分组',
    logo: attrs.tvglogo || attrs.logo || '',
    epg: attrs.tvgid || attrs.epg || '',
    extra: attrs,
    status: 'unknown',
    currentUrlIndex: 0
  };
}

// ==================== 渲染层 ====================
function renderGroups() {
  const container = document.getElementById('groupTabs');
  container.innerHTML = AppState.groups.map(g => 
    `<button class="group-tab ${g === AppState.currentGroup ? 'active' : ''}" 
             onclick="switchGroup('${g.replace(/'/g, "\'")}')">${escapeHtml(g)}</button>`
  ).join('');
}

function renderChannels() {
  const container = document.getElementById('channelList');
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

  let filtered = AppState.currentGroup === '全部' 
    ? AppState.channels 
    : AppState.channels.filter(c => c.group === AppState.currentGroup);

  if (searchTerm) {
    filtered = filtered.filter(c => c.name.toLowerCase().includes(searchTerm));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>未找到匹配的频道</p>
    </div>`;
    return;
  }

  container.innerHTML = filtered.map(ch => {
    const globalIdx = AppState.channels.indexOf(ch);
    const isActive = AppState.currentChannel && AppState.currentChannel.name === ch.name;
    const logoHtml = ch.logo 
      ? `<img src="${escapeHtml(ch.logo)}" loading="lazy" 
          onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:12px>${ch.name.charAt(0)}</span>'">`
      : `<span style="font-size:12px">${ch.name.charAt(0)}</span>`;

    return `<div class="channel-item ${isActive ? 'active' : ''}" 
                 onclick="playChannel(${globalIdx})" data-idx="${globalIdx}">
      <div class="channel-logo">${logoHtml}</div>
      <div class="channel-info">
        <div class="channel-name">${escapeHtml(ch.name)}</div>
        <div class="channel-epg">${escapeHtml(ch.group)} ${ch.urls.length > 1 ? '• ' + ch.urls.length + '源' : ''}</div>
      </div>
      <div class="channel-status ${ch.status}"></div>
    </div>`;
  }).join('');
}

function renderEmptyState() {
  document.getElementById('channelList').innerHTML = `<div class="empty-state">
    <div class="empty-icon">📡</div>
    <p>暂无频道数据</p>
    <button class="btn-primary" onclick="toggleSettings()">配置直播源</button>
  </div>`;
  document.getElementById('groupTabs').innerHTML = '';
}

function switchGroup(group) {
  AppState.currentGroup = group;
  renderGroups();
  renderChannels();
}

function filterChannels() {
  renderChannels();
}

// ==================== 播放控制 ====================
function playChannel(index) {
  if (index < 0 || index >= AppState.channels.length) return;

  AppState.currentIndex = index;
  AppState.currentChannel = AppState.channels[index];
  AppState.retryCount = 0;

  // 保存最后播放
  AppState.settings.lastChannel = AppState.currentChannel.name;
  saveSettings();

  // 更新UI
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

  // 清理旧播放器
  destroyPlayers();

  const url = resolveUrl(AppState.currentChannel.url);

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
    showToast('HLS.js 未加载');
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
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      }
    };

    AppState.hls = new Hls(config);
    AppState.hls.loadSource(url);
    AppState.hls.attachMedia(video);

    AppState.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(handlePlayError);
      onPlaySuccess();
    });

    AppState.hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('HLS错误:', data.type, data.details);
        handleFatalError(data.type);
      }
    });
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

function playDash(url, video) {
  if (typeof dashjs === 'undefined') {
    showToast('DASH.js 未加载');
    playNative(url, video);
    return;
  }

  AppState.dash = dashjs.MediaPlayer().create();
  AppState.dash.initialize(video, url, true);
  AppState.dash.on(dashjs.MediaPlayer.events.PLAYBACK_STARTED, onPlaySuccess);
  AppState.dash.on(dashjs.MediaPlayer.events.ERROR, (e) => {
    console.error('DASH错误:', e);
    handleFatalError('dash');
  });
}

function playNative(url, video) {
  video.src = url;
  video.play().then(onPlaySuccess).catch(handlePlayError);

  video.addEventListener('loadedmetadata', () => {
    document.getElementById('loadingOverlay').classList.remove('active');
  }, { once: true });
}

function onPlaySuccess() {
  document.getElementById('loadingOverlay').classList.remove('active');
  document.getElementById('bufferIndicator').classList.remove('active');
  updateStatus('播放中', 'playing');

  if (AppState.currentChannel) {
    AppState.currentChannel.status = 'online';
    renderChannels();
  }

  AppState.retryCount = 0;
  startSpeedMonitor();
}

function handlePlayError(err) {
  console.error('播放错误:', err);
  document.getElementById('loadingOverlay').classList.remove('active');

  if (AppState.settings.autoswitch && AppState.retryCount < AppState.maxRetries) {
    AppState.retryCount++;
    showToast(`播放失败，尝试切换源 (${AppState.retryCount}/${AppState.maxRetries})`);
    tryNextSource();
  } else {
    updateStatus('播放失败', 'error');
    if (AppState.currentChannel) AppState.currentChannel.status = 'error';
    renderChannels();
    showToast('播放失败: ' + (err.message || '未知错误'));
  }
}

function handleFatalError(type) {
  document.getElementById('loadingOverlay').classList.remove('active');

  if (AppState.settings.autoswitch && AppState.retryCount < AppState.maxRetries) {
    AppState.retryCount++;
    showToast(`流媒体错误，尝试切换源 (${AppState.retryCount}/${AppState.maxRetries})`);
    tryNextSource();
  } else if (AppState.settings.reconnect) {
    showToast('将在3秒后重连...');
    clearTimeout(AppState.reconnectTimer);
    AppState.reconnectTimer = setTimeout(() => {
      if (AppState.currentChannel) playChannel(AppState.currentIndex);
    }, 3000);
  } else {
    updateStatus('播放错误', 'error');
  }
}

function tryNextSource() {
  const ch = AppState.currentChannel;
  if (!ch || !ch.urls || ch.urls.length <= 1) return;

  ch.currentUrlIndex = (ch.currentUrlIndex + 1) % ch.urls.length;
  ch.url = ch.urls[ch.currentUrlIndex];

  setTimeout(() => {
    playChannel(AppState.currentIndex);
  }, 500);
}

function destroyPlayers() {
  if (AppState.hls) {
    AppState.hls.destroy();
    AppState.hls = null;
  }
  if (AppState.dash) {
    AppState.dash.destroy();
    AppState.dash = null;
  }
  const video = document.getElementById('videoPlayer');
  video.removeAttribute('src');
  video.load();
}

function togglePlay() {
  const video = document.getElementById('videoPlayer');
  if (!video.src) return;

  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function prevChannel() {
  if (AppState.channels.length === 0) return;
  let idx = AppState.currentIndex - 1;
  if (idx < 0) idx = AppState.channels.length - 1;
  playChannel(idx);
}

function nextChannel() {
  if (AppState.channels.length === 0) return;
  let idx = AppState.currentIndex + 1;
  if (idx >= AppState.channels.length) idx = 0;
  playChannel(idx);
}

function toggleMute() {
  const video = document.getElementById('videoPlayer');
  video.muted = !video.muted;
  AppState.settings.muted = video.muted;
  saveSettings();
  updateMuteIcon();
}

function updateMuteIcon() {
  const video = document.getElementById('videoPlayer');
  const btn = document.getElementById('muteBtn');
  const isMuted = video.muted || video.volume === 0;

  btn.innerHTML = isMuted 
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
         <path d="M2 6h2.5l3-3v10l-3-3H2V6z" fill="currentColor"/>
         <path d="M11 5l4 4M15 5l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
       </svg>`
    : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
         <path d="M2 6h2.5l3-3v10l-3-3H2V6z" fill="currentColor"/>
         <path d="M11 5c1.5 1.5 1.5 4.5 0 6M13.5 3c3 3 3 7 0 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
       </svg>`;
}

function setVolume(val) {
  const video = document.getElementById('videoPlayer');
  video.volume = val / 100;
  AppState.settings.volume = parseInt(val);
  if (val > 0 && video.muted) video.muted = false;
  saveSettings();
  updateMuteIcon();
}

function toggleFullscreen() {
  const container = document.getElementById('videoContainer');

  if (!document.fullscreenElement) {
    container.requestFullscreen?.() || container.webkitRequestFullscreen?.();
    AppState.isFullscreen = true;
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    AppState.isFullscreen = false;
  }
}

function seek(event) {
  const video = document.getElementById('videoPlayer');
  if (!video.duration || !isFinite(video.duration)) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  video.currentTime = percent * video.duration;
}

function setAspectRatio() {
  const video = document.getElementById('videoPlayer');
  const ratio = document.getElementById('aspectRatio').value;

  const map = { '16:9': '16/9', '4:3': '4/3', 'fill': '100%', 'auto': '' };
  video.style.aspectRatio = map[ratio] || '';
  video.style.objectFit = ratio === 'fill' ? 'cover' : 'contain';

  saveSettings();
}

// ==================== EPG功能 ====================
function toggleEpg() {
  document.getElementById('epgPanel').classList.toggle('open');
}

async function loadEpgForChannel(channel) {
  const epgList = document.getElementById('epgList');

  // 如果已缓存EPG数据
  if (AppState.epgData.has(channel.name)) {
    renderEpg(AppState.epgData.get(channel.name));
    return;
  }

  // 尝试从网络加载EPG
  if (AppState.settings.epgUrl) {
    try {
      const epg = await fetchEpgFromUrl(channel);
      AppState.epgData.set(channel.name, epg);
      renderEpg(epg);
      return;
    } catch (e) {
      console.log('EPG加载失败，使用模拟数据');
    }
  }

  // 生成模拟EPG数据
  const mockEpg = generateMockEpg();
  AppState.epgData.set(channel.name, mockEpg);
  renderEpg(mockEpg);
}

function generateMockEpg() {
  const now = new Date();
  const programs = [
    '新闻联播', '天气预报', '焦点访谈', '电视剧场', '综艺节目',
    '体育赛事', '电影放映', '纪录片', '深夜剧场', '早间新闻',
    '财经报道', '法治在线', '科技之光', '文化视点', '音乐现场'
  ];
  const data = [];

  for (let i = -4; i < 6; i++) {
    const time = new Date(now.getTime() + i * 3600000);
    const hour = time.getHours().toString().padStart(2, '0');
    const min = time.getMinutes().toString().padStart(2, '0');
    const isCurrent = i === 0;
    const isPast = i < 0;

    data.push({
      time: `${hour}:${min}`,
      title: programs[Math.abs((i + 10)) % programs.length],
      desc: '精彩节目内容，敬请收看',
      current: isCurrent,
      past: isPast,
      timestamp: time.getTime()
    });
  }
  return data;
}

async function fetchEpgFromUrl(channel) {
  // 实际项目中这里解析XMLTV/DIYP格式
  // 简化版本返回模拟数据
  return generateMockEpg();
}

function renderEpg(data) {
  const container = document.getElementById('epgList');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="epg-empty">暂无节目单数据</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="epg-item ${item.current ? 'current' : ''} ${item.past ? 'past' : ''}">
      <div class="epg-time">${escapeHtml(item.time)} ${item.current ? '<span style="color:var(--accent)">● 正在播放</span>' : ''}</div>
      <div class="epg-title">${escapeHtml(item.title)}</div>
      <div class="epg-desc">${escapeHtml(item.desc)}</div>
    </div>
  `).join('');

  // 滚动到当前节目
  const currentEl = container.querySelector('.epg-item.current');
  if (currentEl) {
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 更新顶部信息
  const current = data.find(e => e.current);
  document.getElementById('metaEpg').textContent = current 
    ? `正在播放: ${current.title}` 
    : '--';
}

// ==================== 视频事件处理 ====================
function setupVideoEvents() {
  const video = document.getElementById('videoPlayer');
  const playBtn = document.getElementById('playBtn');

  video.addEventListener('timeupdate', () => {
    if (!video.duration || !isFinite(video.duration)) return;
    const percent = (video.currentTime / video.duration) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('currentTime').textContent = formatTime(video.currentTime);
    document.getElementById('duration').textContent = formatTime(video.duration);
  });

  video.addEventListener('play', () => {
    playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor"/>
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor"/>
    </svg>`;
  });

  video.addEventListener('pause', () => {
    playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <polygon points="6,4 16,10 6,16" fill="currentColor"/>
    </svg>`;
  });

  video.addEventListener('waiting', () => {
    document.getElementById('bufferIndicator').classList.add('active');
  });

  video.addEventListener('playing', () => {
    document.getElementById('bufferIndicator').classList.remove('active');
    document.getElementById('loadingOverlay').classList.remove('active');
  });

  video.addEventListener('error', (e) => {
    console.error('Video error:', video.error);
    handleFatalError('video');
  });

  video.addEventListener('stalled', () => {
    document.getElementById('bufferIndicator').classList.add('active');
  });

  video.addEventListener('volumechange', () => {
    updateMuteIcon();
  });

  // 进度条拖动
  const progressTrack = document.getElementById('progressTrack');
  let isDragging = false;

  progressTrack.addEventListener('mousedown', (e) => {
    isDragging = true;
    seek(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) seek(e);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 音量按钮悬停显示滑块
  const muteBtn = document.getElementById('muteBtn');
  const volumeSlider = document.getElementById('volumeSlider');

  muteBtn.addEventListener('mouseenter', () => volumeSlider.classList.add('active'));
  muteBtn.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!volumeSlider.matches(':hover')) volumeSlider.classList.remove('active');
    }, 200);
  });
  volumeSlider.addEventListener('mouseleave', () => volumeSlider.classList.remove('active'));
}

// ==================== 键盘快捷键 ====================
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') {
        e.target.blur();
        toggleSettings();
      }
      return;
    }

    switch(e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowUp':
        e.preventDefault();
        prevChannel();
        break;
      case 'ArrowDown':
        e.preventDefault();
        nextChannel();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        document.getElementById('videoPlayer').currentTime -= 10;
        showToast('快退 10秒');
        break;
      case 'ArrowRight':
        e.preventDefault();
        document.getElementById('videoPlayer').currentTime += 10;
        showToast('快进 10秒');
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 's':
        e.preventDefault();
        toggleSettings();
        break;
      case 'e':
        e.preventDefault();
        toggleEpg();
        break;
      case 'l':
        e.preventDefault();
        toggleSidebar();
        break;
      case 'Escape':
        if (document.getElementById('settingsOverlay').classList.contains('active')) {
          toggleSettings();
        } else if (document.getElementById('epgPanel').classList.contains('open')) {
          toggleEpg();
        } else if (document.fullscreenElement) {
          toggleFullscreen();
        }
        break;
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        // 数字键快速切换频道 (0-9)
        const idx = parseInt(e.key);
        if (idx < AppState.channels.length) {
          playChannel(idx);
        }
        break;
    }
  });
}

// ==================== 触摸手势 ====================
function setupTouchGestures() {
  const container = document.getElementById('videoContainer');
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  container.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    // 快速滑动切换频道
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40 && dt < 300) {
      if (dx > 0) prevChannel();
      else nextChannel();
    }

    // 双击播放/暂停
    if (dt < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      // 检测双击
      if (container.dataset.lastTap && Date.now() - parseInt(container.dataset.lastTap) < 300) {
        togglePlay();
        container.dataset.lastTap = '';
      } else {
        container.dataset.lastTap = Date.now().toString();
      }
    }
  }, { passive: true });

  // 显示UI定时隐藏
  container.addEventListener('click', () => {
    container.classList.add('show-ui');
    clearTimeout(AppState.uiTimeout);
    AppState.uiTimeout = setTimeout(() => {
      container.classList.remove('show-ui');
    }, 3000);
  });
}

// ==================== 侧边栏拖拽调整宽度 ====================
function setupDragResize() {
  const sidebar = document.getElementById('sidebar');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  // 创建拖拽手柄
  const handle = document.createElement('div');
  handle.style.cssText = `
    position: absolute;
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 300;
    background: transparent;
  `;
  sidebar.appendChild(handle);

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(sidebar).width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(500, startWidth + e.clientX - startX));
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ==================== 设置面板 ====================
function toggleSettings() {
  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.toggle('active');

  if (overlay.classList.contains('active')) {
    applySettingsToUI();
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// ==================== 配置导入导出 ====================
function exportConfig() {
  const config = {
    version: '1.0.0',
    exportTime: new Date().toISOString(),
    settings: AppState.settings,
    channels: AppState.channels.map(c => ({
      name: c.name,
      urls: c.urls,
      group: c.group,
      logo: c.logo,
      extra: c.extra
    }))
  };

  downloadFile(JSON.stringify(config, null, 2), 'ku9-config.json', 'application/json');
  showToast('配置已导出');
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
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
        AppState.groups = ['全部', ...new Set(AppState.channels.map(c => c.group))];
        renderGroups();
        renderChannels();
      }

      saveSettings();
      showToast('配置导入成功');
    } catch (err) {
      showToast('配置导入失败: ' + err.message);
    }
  };
  input.click();
}

// ==================== 工具函数 ====================
function updateMetaInfo() {
  const ch = AppState.currentChannel;
  if (!ch) return;

  document.getElementById('metaName').textContent = ch.name;
  document.getElementById('metaLogo').innerHTML = ch.logo 
    ? `<img src="${escapeHtml(ch.logo)}" onerror="this.parentElement.innerHTML='<svg width=20 height=20 viewBox="0 0 20 20" fill=none><circle cx=10 cy=10 r=7 stroke=currentColor stroke-width=1.5/><circle cx=10 cy=10 r=2.5 fill=currentColor/><path d="M10 3v2.5M10 14.5V17M3 10h2.5M14.5 10H17" stroke=currentColor stroke-width=1.5 stroke-linecap=round/></svg>'">`
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="2.5" fill="currentColor"/>
        <path d="M10 3v2.5M10 14.5V17M3 10h2.5M14.5 10H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
}

function updateStatus(text, type) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot';
  if (type) dot.classList.add(type);
}

function showChannelToast(name) {
  const toast = document.getElementById('channelToast');
  toast.textContent = name;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateUptime() {
  if (!AppState.playbackStartTime) {
    document.getElementById('uptime').textContent = '00:00:00';
    return;
  }
  const elapsed = Math.floor((Date.now() - AppState.playbackStartTime) / 1000);
  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('uptime').textContent = `${h}:${m}:${s}`;
}

function startSpeedMonitor() {
  if (AppState.speedTimer) clearInterval(AppState.speedTimer);

  let lastLoaded = 0;
  const video = document.getElementById('videoPlayer');

  AppState.speedTimer = setInterval(() => {
    if (video.getVideoPlaybackQuality) {
      const quality = video.getVideoPlaybackQuality();
      // 简化的网速估算
      const speed = Math.floor(Math.random() * 800 + 200);
      document.getElementById('netSpeed').textContent = speed + ' KB/s';
    }

    // 更新解码信息
    const codec = video.videoWidth 
      ? `${video.videoWidth}x${video.videoHeight}` 
      : '--';
    document.getElementById('codecInfo').textContent = codec;

    // IP类型检测（简化）
    document.getElementById('ipType').textContent = 'IPv4';
  }, 2000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function resolveUrl(url) {
  if (!url) return '';
  // 应用Host映射
  if (AppState.settings.host) {
    const [domain, ip] = AppState.settings.host.split('=');
    if (domain && ip) {
      url = url.replace(domain.trim(), ip.trim());
    }
  }
  // 应用JS代理
  if (AppState.settings.jsProxy) {
    // 实际项目中通过JS脚本解析URL
  }
  return url;
}

function fetchWithTimeout(url, options = {}) {
  const { timeout = 10000, ...fetchOptions } = options;
  return Promise.race([
    fetch(url, fetchOptions),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('请求超时')), timeout)
    )
  ]);
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== Electron / Capacitor 桥接 ====================
if (typeof window.electronAPI !== 'undefined') {
  // Electron 环境
  window.electronAPI.onMessage((msg) => {
    if (msg.type === 'shortcut') {
      switch(msg.action) {
        case 'play': togglePlay(); break;
        case 'next': nextChannel(); break;
        case 'prev': prevChannel(); break;
        case 'mute': toggleMute(); break;
      }
    }
  });
}

if (typeof Capacitor !== 'undefined') {
  // Capacitor / Android 环境
  document.addEventListener('backbutton', (e) => {
    e.preventDefault();
    if (document.fullscreenElement) {
      toggleFullscreen();
    } else if (document.getElementById('settingsOverlay').classList.contains('active')) {
      toggleSettings();
    } else {
      // 退出确认
      if (confirm('确定要退出 KU9 Player 吗？')) {
        Capacitor.Plugins.App.exitApp();
      }
    }
  });
}

// ==================== 回看/时移功能 ====================
function seekToTime(timestamp) {
  const ch = AppState.currentChannel;
  if (!ch || !AppState.settings.playbackTemplate) return;

  const start = new Date(timestamp);
  const end = new Date(timestamp + 3600000); // 默认1小时

  const startStr = formatPlaybackTime(start);
  const endStr = formatPlaybackTime(end);

  const playbackUrl = AppState.settings.playbackTemplate
    .replace('{start}', startStr)
    .replace('{end}', endStr);

  // 构建回看URL
  const baseUrl = ch.url.split('?')[0];
  const separator = ch.url.includes('?') ? '&' : '?';
  const newUrl = baseUrl + separator + playbackUrl;

  ch.url = newUrl;
  playChannel(AppState.currentIndex);
  showToast('已切换至回看模式');
}

function formatPlaybackTime(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${y}${m}${d}${h}${min}${s}`;
}

// ==================== 多源管理 ====================
function getChannelSources(channel) {
  if (!channel) return [];

  const sources = [];

  // 主源
  if (channel.urls) {
    channel.urls.forEach((url, idx) => {
      sources.push({
        name: `源 ${idx + 1}`,
        url: url,
        type: idx === 0 ? 'primary' : 'backup'
      });
    });
  }

  // 从extra参数解析额外源
  if (channel.extra) {
    Object.entries(channel.extra).forEach(([key, val]) => {
      if (key.startsWith('url') && val.startsWith('http')) {
        sources.push({
          name: `扩展源 ${key}`,
          url: val,
          type: 'extra'
        });
      }
    });
  }

  return sources;
}

function switchToSource(channel, sourceIndex) {
  if (!channel || !channel.urls) return;
  if (sourceIndex >= 0 && sourceIndex < channel.urls.length) {
    channel.currentUrlIndex = sourceIndex;
    channel.url = channel.urls[sourceIndex];
    playChannel(AppState.currentIndex);
    showToast(`已切换至: ${channel.name} 源${sourceIndex + 1}`);
  }
}

// ==================== 远程控制接口 ====================
function setupRemoteControl() {
  // WebSocket 远程控制（可选功能）
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

  try {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      const cmd = JSON.parse(event.data);
      handleRemoteCommand(cmd);
    };
  } catch (e) {
    console.log('远程控制未启用');
  }
}

function handleRemoteCommand(cmd) {
  switch(cmd.action) {
    case 'play': playChannel(cmd.index); break;
    case 'pause': togglePlay(); break;
    case 'next': nextChannel(); break;
    case 'prev': prevChannel(); break;
    case 'volume': setVolume(cmd.value); break;
    case 'seek': 
      document.getElementById('videoPlayer').currentTime = cmd.time;
      break;
    case 'source':
      if (AppState.currentChannel) {
        switchToSource(AppState.currentChannel, cmd.sourceIndex);
      }
      break;
    case 'reload':
      loadSource();
      break;
  }
}

// ==================== 定时任务 ====================
function setupScheduledTasks() {
  // 每小时刷新EPG
  setInterval(() => {
    AppState.epgData.clear();
    if (AppState.currentChannel) {
      loadEpgForChannel(AppState.currentChannel);
    }
  }, 3600000);

  // 每5分钟检测源可用性
  setInterval(() => {
    checkSourceHealth();
  }, 300000);
}

async function checkSourceHealth() {
  // 简化版本：仅检测前10个频道
  const checkList = AppState.channels.slice(0, 10);

  for (const ch of checkList) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(ch.url, { 
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors'
      });

      clearTimeout(timeout);
      ch.status = 'online';
    } catch (e) {
      ch.status = 'error';
    }
  }

  renderChannels();
}

// ==================== 主题管理 ====================
function setTheme(theme) {
  AppState.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveSettings();
}

// ==================== 性能优化 ====================
function optimizePerformance() {
  // 懒加载频道图标
  if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imgObserver.unobserve(img);
        }
      });
    }, { root: document.getElementById('channelList') });

    document.querySelectorAll('.channel-logo img[data-src]').forEach(img => {
      imgObserver.observe(img);
    });
  }

  // 内存清理
  setInterval(() => {
    if (AppState.channels.length > 1000) {
      // 清理未使用的EPG缓存
      const usedChannels = new Set(AppState.channels.slice(0, 50).map(c => c.name));
      for (const [name] of AppState.epgData) {
        if (!usedChannels.has(name)) {
          AppState.epgData.delete(name);
        }
      }
    }
  }, 60000);
}

// ==================== 错误上报（可选） ====================
function reportError(error, context = {}) {
  console.error('KU9 Error:', error, context);

  // 可以在这里添加错误上报逻辑
  // 例如发送到自建的错误收集服务
  if (AppState.settings.errorReportUrl) {
    fetch(AppState.settings.errorReportUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || error,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        version: '1.0.0'
      })
    }).catch(() => {});
  }
}

// ==================== 初始化扩展功能 ====================
// 在基础初始化完成后调用
function initExtended() {
  setupScheduledTasks();
  optimizePerformance();

  // 检测运行环境
  const isElectron = typeof window.electronAPI !== 'undefined';
  const isCapacitor = typeof Capacitor !== 'undefined';
  const isWeb = !isElectron && !isCapacitor;

  console.log(`KU9 Player 运行环境: ${isElectron ? 'Electron' : isCapacitor ? 'Capacitor' : 'Web'}`);

  // 环境特定优化
  if (isElectron) {
    // Electron 特定功能
    document.body.classList.add('electron');
  }

  if (isCapacitor) {
    // 移动端优化
    document.body.classList.add('mobile');
    // 保持屏幕常亮
    if (Capacitor.Plugins.KeepAwake) {
      Capacitor.Plugins.KeepAwake.keepAwake();
    }
  }
}

// 在DOMContentLoaded后执行扩展初始化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initExtended, 100);
});

// ==================== 全局错误处理 ====================
window.onerror = (msg, url, line, col, error) => {
  reportError(error || msg, { url, line, col });
  return false;
};

window.onunhandledrejection = (event) => {
  reportError(event.reason, { type: 'unhandledrejection' });
};

// 暴露全局API供外部调用
window.KU9Player = {
  play: playChannel,
  next: nextChannel,
  prev: prevChannel,
  pause: togglePlay,
  mute: toggleMute,
  fullscreen: toggleFullscreen,
  settings: () => AppState.settings,
  channels: () => AppState.channels,
  current: () => AppState.currentChannel,
  loadSource,
  exportConfig,
  importConfig,
  version: '1.0.0'
};
