/** 页面隐藏或窗口失焦均暂停；重新聚焦仍须等待页面可见。 */
export function 监听播放后台(更新: (后台: boolean) => void) {
  let 失焦 = false
  const 同步 = () => 更新(document.hidden || 失焦)
  const 离开 = () => { 失焦 = true; 同步() }
  const 返回 = () => { 失焦 = false; 同步() }
  document.addEventListener('visibilitychange', 同步)
  window.addEventListener('blur', 离开)
  window.addEventListener('focus', 返回)
  同步()
  return () => {
    document.removeEventListener('visibilitychange', 同步)
    window.removeEventListener('blur', 离开)
    window.removeEventListener('focus', 返回)
  }
}
