// 窗口会话同步：把演示文稿会话（内容版本、广播、保存状态）接到编辑器的修改链路上。
// 全部副作用通过注入的会话接口完成，便于在测试中替换为假实现。
export interface 会话变更消息 {
  类型: '会话变更' | '已保存'
  版本?: number
  内容?: unknown
  路径?: string
  文稿标识?: string
}

export interface 会话接口 {
  register: (文稿标识: string, 视图标识: string, 初始内容?: unknown, 路径?: string) => Promise<{ 成功: boolean; 版本?: number; 内容?: unknown; 路径?: string; 已保存?: boolean; 错误?: string }>
  read: (文稿标识: string) => Promise<{ 成功: boolean; 版本?: number; 内容?: unknown; 路径?: string; 已保存?: boolean; 错误?: string }>
  commit: (文稿标识: string, 期望版本: number, 内容: unknown, 视图标识: string) => Promise<{ 成功: boolean; 版本?: number; 错误?: string }>
  saved: (文稿标识: string, 路径: string, 视图标识: string) => Promise<{ 成功: boolean; 版本?: number; 错误?: string }>
  claimPath: (文稿标识: string, 路径: string) => Promise<{ 成功: boolean; 错误?: string }>
  releasePath: (文稿标识: string, 路径: string) => Promise<{ 成功: boolean; 错误?: string }>
  unregister: (文稿标识: string, 视图标识: string) => Promise<{ 成功: boolean; 是否最后视图?: boolean; 错误?: string }>
  identity: () => Promise<{ 成功: boolean; 文稿标识?: string; 视图标识?: string }>
  onChanged: (回调: (消息: 会话变更消息) => void) => () => void
}

interface 参数 {
  会话: 会话接口
  /** 视图标识缺省时自动生成，保证同一窗口内唯一 */
  视图标识?: string
  on内容?: (内容: unknown, 版本: number) => void
  on已保存?: (路径: string | undefined, 版本: number) => void
  on冲突?: (最新: { 版本: number; 内容: unknown }) => void
}

const 生成视图标识 = () => `视图-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function 创建会话同步({ 会话, 视图标识 = 生成视图标识(), on内容, on已保存, on冲突 }: 参数) {
  let 文稿标识: string | null = null
  let 版本 = 0
  let 已注册 = false
  let 释放监听: (() => void) | null = null

  const 处理消息 = (消息: 会话变更消息) => {
    if (!已注册 || !消息 || typeof 消息 !== 'object') return
    if (消息.文稿标识 && 消息.文稿标识 !== 文稿标识) return
    if (消息.类型 === '已保存') {
      on已保存?.(消息.路径, 消息.版本 ?? 版本)
      return
    }
    if (消息.类型 !== '会话变更') return
    const 远端版本 = 消息.版本 ?? 0
    // 只接受更新的版本：重复广播与旧广播一律忽略，避免把本地新修改回退
    if (远端版本 <= 版本) return
    版本 = 远端版本
    on内容?.(消息.内容, 远端版本)
  }

  const 开始监听 = () => {
    if (释放监听) return
    释放监听 = 会话.onChanged(处理消息)
  }

  return {
    视图标识,
    取版本: () => 版本,
    取文稿标识: () => 文稿标识,

    /** 首次注册：把当前内容与路径交给会话，其他窗口注册同一文稿时复用该内容 */
    async 注册(标识: string, 初始内容: unknown, 路径?: string) {
      const 结果 = await 会话.register(标识, 视图标识, 初始内容, 路径)
      if (!结果.成功) return { 成功: false as const, 错误: 结果.错误 ?? '无法加入文稿会话' }
      文稿标识 = 标识
      版本 = 结果.版本 ?? 1
      已注册 = true
      开始监听()
      return { 成功: true as const, 版本, 内容: 结果.内容, 路径: 结果.路径 }
    },

    /** 新窗口接管：读取主进程登记的身份并加入会话，返回共享内容 */
    async 接管() {
      const 身份 = await 会话.identity()
      if (!身份?.成功 || !身份.文稿标识 || !身份.视图标识) {
        return { 成功: false as const, 错误: '当前窗口没有文稿会话身份' }
      }
      const 结果 = await 会话.register(身份.文稿标识, 身份.视图标识)
      if (!结果.成功) return { 成功: false as const, 错误: 结果.错误 ?? '无法加入文稿会话' }
      文稿标识 = 身份.文稿标识
      版本 = 结果.版本 ?? 1
      已注册 = true
      开始监听()
      return { 成功: true as const, 文稿标识, 版本, 内容: 结果.内容, 路径: 结果.路径 }
    },

    /** 本地修改提交：版本过期时重新读取最新内容并报告冲突，不覆盖远端 */
    async 提交(内容: unknown) {
      if (!已注册 || !文稿标识) return { 成功: false as const, 错误: '尚未加入文稿会话' }
      const 结果 = await 会话.commit(文稿标识, 版本, 内容, 视图标识)
      if (结果.成功) {
        版本 = 结果.版本 ?? 版本 + 1
        return { 成功: true as const, 版本 }
      }
      const 最新 = await 会话.read(文稿标识)
      if (最新.成功) {
        版本 = 最新.版本 ?? 版本
        on冲突?.({ 版本, 内容: 最新.内容 })
      }
      return { 成功: false as const, 错误: 结果.错误 ?? '提交失败', 版本 }
    },

    /** 保存成功：通知会话，其他视图同步为已保存 */
    async 已保存(路径: string) {
      if (!已注册 || !文稿标识) return { 成功: false as const, 错误: '尚未加入文稿会话' }
      const 结果 = await 会话.saved(文稿标识, 路径, 视图标识)
      return 结果.成功 ? { 成功: true as const, 版本: 结果.版本 ?? 版本 } : { 成功: false as const, 错误: 结果.错误 ?? '保存状态同步失败' }
    },

    async 认领路径(路径: string) {
      if (!已注册 || !文稿标识) return { 成功: false as const, 错误: '尚未加入文稿会话' }
      return await 会话.claimPath(文稿标识, 路径)
    },

    /** 注销视图：最后一个视图关闭时文稿从会话释放 */
    async 注销() {
      if (!已注册 || !文稿标识) return { 成功: false as const, 错误: '尚未加入文稿会话' }
      const 结果 = await 会话.unregister(文稿标识, 视图标识)
      已注册 = false
      释放监听?.()
      释放监听 = null
      return 结果.成功
        ? { 成功: true as const, 是否最后视图: 结果.是否最后视图 ?? false }
        : { 成功: false as const, 错误: 结果.错误 ?? '注销视图失败' }
    },
  }
}

export type 会话同步 = ReturnType<typeof 创建会话同步>
