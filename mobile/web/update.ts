/** 移动原生更新适配，沿用统一更新接口与当前云服务地址。 */
export function createNativeUpdateApi(platform: string, version: string, cloud: { status: () => { url: string }; request: (path: string) => Promise<any> },
  call: (action: any, fields?: Record<string, unknown>) => Promise<any>, listen: (callback: (state: any) => void) => () => void) {
  const invoke = async (action: any, fields?: Record<string, unknown>) => {
    try { return await call(action, fields) }
    catch (error) { return { 成功: false, 错误: error instanceof Error ? error.message : '原生更新操作失败' } }
  }
  return {
    info: async () => ({ 成功: true, 平台: platform, 版本: version }),
    check: async (channel = 'stable') => {
      try { return { 成功: true, 数据: await cloud.request('/v1/updates/latest?' + new URLSearchParams({ platform, version, channel })) } }
      catch (error) { return { 成功: false, 错误: error instanceof Error ? error.message : '检查更新失败' } }
    },
    download: (release: unknown) => invoke('update-download', { release, base: cloud.status().url }),
    status: () => invoke('update-status'),
    cancel: () => invoke('update-cancel'),
    installReady: () => invoke('update-install'),
    onProgress: listen,
  }
}

/** 鸿蒙应用市场负责更新，弹窗展示不表示已经安装。 */
export function createHarmonyStoreUpdateApi(version: string, cloud: { request: (path: string) => Promise<any> },
  call: (action: any) => Promise<any>) {
  return {
    info: async () => ({ 成功: true, 平台: 'harmony', 版本: version }),
    check: async (channel = 'stable') => {
      try { return { 成功: true, 数据: await cloud.request('/v1/updates/latest?' + new URLSearchParams({ platform: 'harmony', version, channel })) } }
      catch (error) { return { 成功: false, 错误: error instanceof Error ? error.message : '检查更新失败' } }
    },
    openStore: async () => {
      try { return await call('update-store-open') }
      catch (error) { return { 成功: false, 错误: error instanceof Error ? error.message : '无法打开应用市场更新' } }
    },
  }
}
