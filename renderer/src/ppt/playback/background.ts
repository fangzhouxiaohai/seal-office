/**
 * 页面隐藏或窗口失焦均暂停；重新聚焦仍须等待页面可见。
 * 打开演讲者窗口后，观众窗口失焦属于正常状态（演讲者窗口会取得焦点），
 * 此时通过 选项.忽略失焦 让观众画面继续播放；页面真正隐藏仍然暂停。
 */
export function 监听播放后台(更新: (后台: boolean) => void, 选项: { 忽略失焦?: () => boolean } = {}) {
  let 失焦 = false
  const 同步 = () => 更新(document.hidden || (失焦 && !选项.忽略失焦?.()))
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
