'use strict';
// 分享落地页：纯静态、无框架、自包含。全部解密在浏览器内完成，
// 服务端只提供密文与访问控制；文件密钥与文件名来自 URL 的 # 片段。
(function () {
  var MAX_BYTES = 100 * 1024 * 1024;
  var state = { id: '', access: '', payload: null, meta: null, busy: false, code: '' };

  var el = function (id) { return document.getElementById(id); };
  var statusEl = el('status');
  function say(text, tone) {
    statusEl.textContent = text || '';
    if (tone) statusEl.dataset.tone = tone; else delete statusEl.dataset.tone;
  }
  function show(node, visible) { node.hidden = !visible; }

  // ---------- 基础编解码 ----------
  function fromBase64Url(value) {
    var text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    var padded = text + '==='.slice((text.length + 3) % 4);
    var binary = atob(padded), bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }
  // 本机密文排列为随机向量、认证标签、正文；浏览器解密要求正文后接认证标签。
  function webCryptoCipher(sealed) {
    var result = new Uint8Array(sealed.length - 12);
    result.set(sealed.subarray(28), 0);
    result.set(sealed.subarray(12, 28), sealed.length - 28);
    return result;
  }
  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  function extensionOf(name) {
    var match = /\.([A-Za-z0-9]{1,6})$/.exec(String(name || ''));
    return match ? match[1].toUpperCase() : '文件';
  }

  // ---------- 路由解析：/share/#/s/<id>?a=<access>&k=<payload> ----------
  function parseRoute() {
    var hash = location.hash.replace(/^#/, '');
    var split = hash.split('?');
    var path = split[0], query = new URLSearchParams(split[1] || '');
    var match = /^\/s\/([0-9a-f-]{36})$/.exec(path);
    return {
      id: match ? match[1] : '',
      access: query.get('a') || '',
      key: query.get('k') || '',
    };
  }

  // ---------- 与服务端通信 ----------
  function endpoint(suffix) {
    // 落地页与云 API 同源部署：页面在 /share/，API 在 /api/v1/。
    return new URL('/api/v1/share-links/' + state.id + (suffix || ''), location.origin).toString();
  }
  function request(url, options) {
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var message = (data && data.error) || '服务暂时不可用，请稍后重试';
          var failure = new Error(message);
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    });
  }

  // ---------- 解密：与 main/cloud/crypto.js 及落地页保持一致 ----------
  async function unwrapFileKey(payload, code) {
    var key = fromBase64Url(payload.k);
    if (key.length === 32) return key;           // 无访问码：片段里直接是文件密钥
    if (key.length !== 60) throw new Error('链接中的密钥信息不完整，请向分享者索取新链接');
    if (!code) throw new Error('请输入访问码');
    // 包裹密钥 = PBKDF2-SHA256(访问码, 'seal-share-link:' + 链接标识, 100000, 32)
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new TextEncoder().encode('seal-share-link:' + state.id), iterations: 100000, hash: 'SHA-256' },
      base, 256
    );
    var wrap = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
    try {
      // 解包后的明文就是 32 字节文件密钥。
      return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: key.subarray(0, 12), additionalData: new TextEncoder().encode('seal-share-link:' + state.id), tagLength: 128 },
        wrap, webCryptoCipher(key)
      ));
    } catch (error) {
      throw new Error('访问码不正确，请重新输入');
    }
  }

  async function decryptFile(fileKey, cipher) {
    if (cipher.byteLength < 29) throw new Error('文件数据不完整，请重新下载');
    var key = await crypto.subtle.importKey('raw', fileKey, 'AES-GCM', false, ['decrypt']);
    try {
      // AAD 上下文必须与加密端完全一致：seal-data:<节点标识>。
    var context = new TextEncoder().encode('seal-data:' + (state.payload.i || ''));
    return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: cipher.subarray(0, 12), additionalData: context, tagLength: 128 },
        key, webCryptoCipher(cipher)
      ));
    } catch (error) {
      throw new Error('文件校验失败，可能已被替换；请向分享者索取新链接');
    }
  }

  async function fetchAndDecrypt(code, trigger) {
    if (state.busy) return;
    state.busy = true;
    var button = trigger || el('download');
    var original = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>正在下载并解密';
    say('正在下载，请保持页面打开。');
    try {
      var fileKey = await unwrapFileKey(state.payload, code);
      var headers = { 'X-Seal-Access': state.access };
      if (code) headers['X-Seal-Code'] = code;
      var response = await fetch(endpoint('/content'), { headers: headers, cache: 'no-store' });
      if (!response.ok) {
        var data = null;
        try { data = await response.json(); } catch (error) { data = null; }
        throw new Error((data && data.error) || '下载失败，请稍后重试');
      }
      var buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > MAX_BYTES + 64) throw new Error('文件超过 100 MiB，无法在浏览器中解密');
      var plain = await decryptFile(fileKey, buffer);
      var blob = new Blob([plain], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url; anchor.download = state.payload.n || '海豹办公文件';
      anchor.rel = 'noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      say('文件已解密并开始保存。若浏览器未自动保存，请再次点击“下载文件”。', 'ok');
      show(el('retry'), true);
      state.code = code;
    } catch (error) {
      say(error && error.message ? error.message : '下载失败，请稍后重试', 'error');
      show(el('retry'), true);
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = original;
    }
  }

  // ---------- 页面装配 ----------
  async function boot() {
    var route = parseRoute();
    state.id = route.id; state.access = route.access;
    if (!route.id || !route.access || !route.key) {
      finish('链接不完整', '请确认复制了完整链接，包含 # 之后的全部内容。', 'error');
      return;
    }
    try {
      state.payload = JSON.parse(utf8(fromBase64Url(route.key)));
    } catch (error) {
      finish('链接已损坏', '请向分享者重新获取链接。', 'error');
      return;
    }
    if (!state.payload || state.payload.v !== 1 || !state.payload.k || !state.payload.i) {
      finish('链接版本不受支持', '请向分享者重新获取链接。', 'error');
      return;
    }
    el('fileName').textContent = '正在确认链接';
    el('summary').textContent = '请稍候，正在向服务器确认有效期。';

    var meta;
    try {
      meta = await request(endpoint(''), { cache: 'no-store' });
    } catch (error) {
      finish(error.status === 410 ? '链接已过期' : '链接不可用',
        error.message || '请向分享者索取新链接。', 'error');
      return;
    }
    state.meta = meta;
    var name = state.payload.n || '未命名文件';
    el('fileName').textContent = name;
    el('fileNameRow').textContent = name;
    el('fileExt').textContent = extensionOf(name);
    el('summary').textContent = meta.expiresAt
      ? '有效期至 ' + new Date(meta.expiresAt).toLocaleString('zh-CN', { hour12: false })
      : '此链接长期有效';
    el('fileMeta').textContent = '已下载 ' + (meta.downloads || 0) + ' 次 · 端到端加密';
    show(el('fileRow'), true);

    if (meta.requiresCode) {
      show(el('codeForm'), true);
      el('notice').textContent = '文件在下载前由你的浏览器直接解密，服务器只保存密文，无法读取文件内容、文件名或访问码。';
      el('code').focus();
      say('');
      return;
    }
    show(el('downloadArea'), true);
    say('可点击下方按钮下载。');
  }

  function finish(title, detail, tone) {
    el('fileName').textContent = title;
    el('summary').textContent = detail;
    show(el('codeForm'), false);
    show(el('downloadArea'), false);
    say('');
    if (tone === 'error') statusEl.dataset.tone = 'error';
  }

  el('codeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var code = el('code').value.trim();
    if (!/^\d{4,8}$/.test(code)) { say('请输入 4–8 位数字访问码', 'error'); el('code').focus(); return; }
    show(el('codeForm'), false);
    show(el('downloadArea'), true);
    void fetchAndDecrypt(code, el('download'));
  });
  el('download').addEventListener('click', function () { void fetchAndDecrypt(state.code, el('download')); });
  el('retry').addEventListener('click', function () { void fetchAndDecrypt(state.code, el('retry')); });

  void boot();
})();
