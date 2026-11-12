// 扫描件库：本机持久存储扫描件（处理后页面图片 + 识别文字 + 元数据）、分组与导出记录。
// 存储方式沿用项目已有做法：移动端工作台的本机文件系统即建立在 IndexedDB 之上
// （mobile/web/shims/fs.js），桌面端 IndexedDB 位于 Electron 用户数据目录内，
// 随应用数据一起清理，不另建路径。网页版不提供扫描件库（浏览器存储不可靠）。

export const 默认分组 = ['我的证件', '我的试卷', '我的错题本', '我的票据']
export type 扫描来源 = '拍照' | '相册' | '文件' | '粘贴'
export type 排序方式 = '时间' | '名称' | '大小'

export interface 扫描页设置 { 四角: Array<{ x: number; y: number }> | null; 模式: '彩色' | '灰度' | '黑白'; 旋转: number }
/** 图片为处理后页面；原图（已缩放到最长边 ≤ 2400）与处理设置用于重新裁边或更换增强效果 */
export interface 扫描页 { 图片: Uint8Array; 类型: 'image/jpeg' | 'image/png'; 宽: number; 高: number; 文字: string; 原图?: Uint8Array; 设置?: 扫描页设置 }
export interface 新扫描件 { 标识?: string; 名称: string; 分组: string; 来源: 扫描来源; 模板: string; 页: 扫描页[] }
export interface 扫描件摘要 { 标识: string; 名称: string; 分组: string; 来源: 扫描来源; 模板: string; 页数: number; 大小: number; 创建时间: number; 修改时间: number; 已识别: boolean; 导出次数: number }
export interface 扫描件 extends 扫描件摘要 { 页: 扫描页[] }
export interface 导出记录 { 标识: string; 扫描件标识: string; 扫描件名称: string; 格式: string; 文件名: string; 时间: number }

export interface 扫描件库 {
  列出(): Promise<扫描件摘要[]>
  读取(标识: string): Promise<扫描件 | null>
  保存(扫描件: 新扫描件): Promise<string>
  删除(标识列表: string[]): Promise<void>
  移动到分组(标识列表: string[], 分组: string): Promise<void>
  列出分组(): Promise<string[]>
  新建分组(名称: string): Promise<void>
  删除分组(名称: string): Promise<void>
  记录导出(标识: string, 格式: string, 文件名: string): Promise<void>
  列出导出记录(): Promise<导出记录[]>
}

const 数据库名 = 'seal-office-scans-v1'
const 表 = { 摘要: 'meta', 页面: 'pages', 导出: 'exports', 设置: 'settings' } as const

const 请求结果 = <T>(请求: IDBRequest<T>) => new Promise<T>((完成, 失败) => { 请求.onsuccess = () => 完成(请求.result); 请求.onerror = () => 失败(请求.error ?? new Error('本机扫描件库读写失败')) })
const 事务完成 = (事务: IDBTransaction) => new Promise<void>((完成, 失败) => {
  事务.oncomplete = () => 完成()
  事务.onerror = () => 失败(事务.error ?? new Error('本机扫描件库写入失败'))
  事务.onabort = () => 失败(事务.error ?? new Error('本机扫描件库写入被中止，可能是存储空间不足'))
})

function 新标识(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export async function 打开扫描件库(工厂: IDBFactory | undefined = globalThis.indexedDB, 现在: () => number = Date.now): Promise<扫描件库> {
  if (!工厂) throw new Error('当前环境没有可用的本机存储，无法使用扫描件库')
  const 打开 = 工厂.open(数据库名, 1)
  打开.onupgradeneeded = () => {
    const 库 = 打开.result
    库.createObjectStore(表.摘要, { keyPath: '标识' })
    库.createObjectStore(表.页面)
    库.createObjectStore(表.导出, { keyPath: '标识' }).createIndex('扫描件', '扫描件标识')
    库.createObjectStore(表.设置)
  }
  const 库 = await 请求结果(打开)

  const 读取分组 = async (): Promise<string[]> => {
    const 自定义 = await 请求结果(库.transaction(表.设置).objectStore(表.设置).get('分组')) as string[] | undefined
    return [...默认分组, ...(Array.isArray(自定义) ? 自定义 : [])]
  }

  return {
    async 列出() { return await 请求结果(库.transaction(表.摘要).objectStore(表.摘要).getAll()) as 扫描件摘要[] },
    async 读取(标识) {
      const 事务 = 库.transaction([表.摘要, 表.页面])
      const [摘要, 页] = await Promise.all([请求结果(事务.objectStore(表.摘要).get(标识)), 请求结果(事务.objectStore(表.页面).get(标识))])
      if (!摘要 || !Array.isArray(页)) return null
      return { ...(摘要 as 扫描件摘要), 页: 页 as 扫描页[] }
    },
    async 保存(输入) {
      const 名称 = 输入.名称.trim()
      if (!名称) throw new Error('扫描件名称不能为空')
      if (!输入.页.length) throw new Error('扫描件至少需要一页')
      const 标识 = 输入.标识 ?? 新标识(), 时间 = 现在()
      const 事务 = 库.transaction([表.摘要, 表.页面], 'readwrite')
      const 原有 = await 请求结果(事务.objectStore(表.摘要).get(标识)) as 扫描件摘要 | undefined
      const 摘要: 扫描件摘要 = {
        标识, 名称, 分组: 输入.分组, 来源: 输入.来源, 模板: 输入.模板, 页数: 输入.页.length,
        大小: 输入.页.reduce((总计, 页) => 总计 + 页.图片.byteLength + (页.原图?.byteLength ?? 0), 0),
        创建时间: 原有?.创建时间 ?? 时间, 修改时间: 时间, 已识别: 输入.页.some(页 => 页.文字.trim() !== ''), 导出次数: 原有?.导出次数 ?? 0,
      }
      事务.objectStore(表.摘要).put(摘要)
      事务.objectStore(表.页面).put(输入.页, 标识)
      await 事务完成(事务)
      return 标识
    },
    async 删除(标识列表) {
      const 事务 = 库.transaction([表.摘要, 表.页面, 表.导出], 'readwrite')
      for (const 标识 of 标识列表) {
        事务.objectStore(表.摘要).delete(标识)
        事务.objectStore(表.页面).delete(标识)
        const 记录键 = await 请求结果(事务.objectStore(表.导出).index('扫描件').getAllKeys(标识))
        for (const 键 of 记录键) 事务.objectStore(表.导出).delete(键)
      }
      await 事务完成(事务)
    },
    async 移动到分组(标识列表, 分组) {
      const 事务 = 库.transaction(表.摘要, 'readwrite'), 存储 = 事务.objectStore(表.摘要)
      for (const 标识 of 标识列表) {
        const 摘要 = await 请求结果(存储.get(标识)) as 扫描件摘要 | undefined
        if (摘要) 存储.put({ ...摘要, 分组 })
      }
      await 事务完成(事务)
    },
    列出分组: 读取分组,
    async 新建分组(原名) {
      const 名称 = 原名.trim()
      if (!名称) throw new Error('分组名称不能为空')
      if (名称.length > 30) throw new Error('分组名称不能超过 30 个字')
      const 现有 = await 读取分组()
      if (现有.includes(名称)) throw new Error('分组已存在')
      const 事务 = 库.transaction(表.设置, 'readwrite')
      事务.objectStore(表.设置).put(现有.filter(项 => !默认分组.includes(项)).concat(名称), '分组')
      await 事务完成(事务)
    },
    async 删除分组(名称) {
      if (默认分组.includes(名称)) throw new Error('默认分组不能删除')
      const 现有 = await 读取分组()
      const 事务 = 库.transaction([表.设置, 表.摘要], 'readwrite'), 存储 = 事务.objectStore(表.摘要)
      事务.objectStore(表.设置).put(现有.filter(项 => !默认分组.includes(项) && 项 !== 名称), '分组')
      for (const 摘要 of await 请求结果(存储.getAll()) as 扫描件摘要[]) if (摘要.分组 === 名称) 存储.put({ ...摘要, 分组: '' })
      await 事务完成(事务)
    },
    async 记录导出(标识, 格式, 文件名) {
      const 事务 = 库.transaction([表.摘要, 表.导出], 'readwrite')
      const 摘要 = await 请求结果(事务.objectStore(表.摘要).get(标识)) as 扫描件摘要 | undefined
      if (!摘要) { 事务.abort(); throw new Error('扫描件不存在或已删除') }
      事务.objectStore(表.导出).put({ 标识: 新标识(), 扫描件标识: 标识, 扫描件名称: 摘要.名称, 格式, 文件名, 时间: 现在() } satisfies 导出记录)
      事务.objectStore(表.摘要).put({ ...摘要, 导出次数: 摘要.导出次数 + 1 })
      await 事务完成(事务)
    },
    async 列出导出记录() {
      const 记录 = await 请求结果(库.transaction(表.导出).objectStore(表.导出).getAll()) as 导出记录[]
      return 记录.sort((甲, 乙) => 乙.时间 - 甲.时间)
    },
  }
}

export function 筛选扫描件(列表: 扫描件摘要[], 条件: { 排序: 排序方式; 分组?: string; 关键字?: string }): 扫描件摘要[] {
  const 关键字 = 条件.关键字?.trim().toLocaleLowerCase() ?? ''
  return 列表
    .filter(项 => 条件.分组 === undefined || 项.分组 === 条件.分组)
    .filter(项 => !关键字 || 项.名称.toLocaleLowerCase().includes(关键字))
    .sort((甲, 乙) => 条件.排序 === '名称' ? 甲.名称.localeCompare(乙.名称, 'zh-CN') : 条件.排序 === '大小' ? 乙.大小 - 甲.大小 : 乙.修改时间 - 甲.修改时间)
}
