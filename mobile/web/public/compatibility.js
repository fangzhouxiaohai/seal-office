/* 此入口保持 ES5 语法，老系统组件也能显示更新提示，避免白屏。 */
(function () {
  var chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent)
  var safari = /Version\/(\d+)(?:\.(\d+))?(?:\.\d+)*.*Safari/.exec(navigator.userAgent)
  var supported = !!(window.indexedDB && window.TextEncoder && window.ResizeObserver && window.crypto && window.crypto.getRandomValues && window.structuredClone && Array.prototype.at)
  if (chrome && Number(chrome[1]) < 100) supported = false
  if (!chrome && safari && (Number(safari[1]) < 15 || Number(safari[1]) === 15 && Number(safari[2] || 0) < 4)) supported = false
  try { if (!window.CSS || !CSS.supports('selector(:where(body))')) supported = false } catch (_) { supported = false }
  if (!supported) {
    document.documentElement.dataset.sealUnsupported = '1'
    var root = document.getElementById('root')
    var panel = document.createElement('div'); panel.style.cssText = 'padding:32px 20px;font:16px/1.7 system-ui;max-width:600px;margin:auto'
    var title = document.createElement('h1'); title.textContent = '请更新后再打开海豹办公'
    var text = document.createElement('p'); text.textContent = chrome ? '系统网页组件版本较旧，请通过系统更新或应用商店更新 Android System WebView／Chrome，然后重新打开。' : '请更新系统或浏览器，然后重新打开海豹办公。'
    var note = document.createElement('p'); note.textContent = '此操作不会删除本机的办公文件。'
    var retry = document.createElement('button'); retry.textContent = '重新打开'; retry.style.cssText = 'padding:12px 20px;font:inherit'; retry.onclick = function () { location.reload() }
    panel.appendChild(title); panel.appendChild(text); panel.appendChild(note); panel.appendChild(retry); root.textContent = ''; root.appendChild(panel)
    return
  }
  // iOS 15 或非安全 HTTP 预览环境缺少 randomUUID，仍使用安全随机数生成。
  if (!crypto.randomUUID) crypto.randomUUID = function () {
    var bytes = new Uint8Array(16); crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
    var parts = []; for (var i = 0; i < bytes.length; i++) parts.push(('0' + bytes[i].toString(16)).slice(-2))
    var hex = parts.join(''); return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20)
  }
})()
