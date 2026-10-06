import { expect, it, vi } from 'vitest'
import { 创建会话同步, type 会话接口 } from './sessionSync'

const 内容 = (文本: string) => ({ 幻灯片: [{ id: '页', 背景色: '#FFFFFF', 文本框: [{ id: '文字', text: 文本, x: 0, y: 0, width: 100, height: 40, 字号: 18 }] }] })

const 建假会话 = () => {
  let 版本 = 1
  let 内容当前 = 内容('初始')
  let 已保存 = true
  const 监听: Array<(消息: { 类型: string; 版本?: number; 内容?: unknown; 路径?: string }) => void> = []
  return {
    接口: {
      register: vi.fn(async () => ({ 成功: true, 版本, 内容: 内容当前, 已保存, 视图数: 1 })),
      read: vi.fn(async () => ({ 成功: true, 版本, 内容: 内容当前, 已保存 })),
      commit: vi.fn(async (_文稿: string, 期望版本: number, 新内容: unknown) => {
        if (期望版本 !== 版本) return { 成功: false, 错误: `内容版本已过期（当前版本 ${版本}）` }
        版本 += 1
        内容当前 = 新内容 as typeof 内容当前
        已保存 = false
        return { 成功: true, 版本 }
      }),
      saved: vi.fn(async () => { 已保存 = true; return { 成功: true, 版本 } }),
      claimPath: vi.fn(async () => ({ 成功: true })),
      releasePath: vi.fn(async () => ({ 成功: true })),
      unregister: vi.fn(async () => ({ 成功: true, 是否最后视图: true })),
      identity: vi.fn(async () => ({ 成功: false })),
      onChanged: vi.fn((回调: typeof 监听[number]) => { 监听.push(回调); return () => { const i = 监听.indexOf(回调); if (i >= 0) 监听.splice(i, 1) } }),
    } as unknown as 会话接口,
    推到远端(内容新: unknown) { 版本 += 1; 内容当前 = 内容新 as typeof 内容当前 },
    广播(消息: Parameters<typeof 监听[number]>[0]) { 监听.forEach(回调 => 回调(消息)) },
    取版本: () => 版本,
  }
}

it('注册后共享同一内容与版本，本地修改按版本提交', async () => {
  const 假 = 建假会话()
  const 收到内容 = vi.fn(), 收到保存 = vi.fn()
  const 同步 = 创建会话同步({ 会话: 假.接口, on内容: 收到内容, on已保存: 收到保存 })
  const 注册 = await 同步.注册('文稿甲', 内容('初始'), 'E:\\资料\\甲.pptx')
  expect(注册).toMatchObject({ 成功: true, 版本: 1 })
  const 提交 = await 同步.提交(内容('本地改'))
  expect(提交).toMatchObject({ 成功: true, 版本: 2 })
  expect(假.接口.commit).toHaveBeenCalledWith('文稿甲', 1, expect.anything(), expect.any(String))
  expect(收到内容).not.toHaveBeenCalled()
})

it('其他窗口的会话变更只在新版本时应用，旧版本忽略', async () => {
  const 假 = 建假会话()
  const 收到内容 = vi.fn()
  const 同步 = 创建会话同步({ 会话: 假.接口, on内容: 收到内容 })
  await 同步.注册('文稿甲', 内容('初始'))
  假.广播({ 类型: '会话变更', 版本: 3, 内容: 内容('远端改') })
  expect(收到内容).toHaveBeenCalledWith(内容('远端改'), 3)
  收到内容.mockClear()
  假.广播({ 类型: '会话变更', 版本: 3, 内容: 内容('重复') })
  假.广播({ 类型: '会话变更', 版本: 1, 内容: 内容('旧') })
  expect(收到内容).not.toHaveBeenCalled()
})

it('过期版本提交失败时重新读取最新内容并报告冲突', async () => {
  const 假 = 建假会话()
  const 冲突 = vi.fn()
  const 同步 = 创建会话同步({ 会话: 假.接口, on冲突: 冲突 })
  await 同步.注册('文稿甲', 内容('初始'))
  假.推到远端(内容('远端改'))   // 远端版本变为 2，本地仍以为 1
  const 提交 = await 同步.提交(内容('本地改'))
  expect(提交.成功).toBe(false)
  expect(冲突).toHaveBeenCalledWith(expect.objectContaining({ 版本: 2, 内容: 内容('远端改') }))
  expect(假.取版本()).toBe(2)
})

it('保存广播把其他视图标记为已保存', async () => {
  const 假 = 建假会话()
  const 收到保存 = vi.fn()
  const 同步 = 创建会话同步({ 会话: 假.接口, on已保存: 收到保存 })
  await 同步.注册('文稿甲', 内容('初始'))
  假.广播({ 类型: '已保存', 版本: 5, 路径: 'E:\\资料\\甲.pptx' })
  expect(收到保存).toHaveBeenCalledWith('E:\\资料\\甲.pptx', 5)
})

it('注销视图后不再处理广播', async () => {
  const 假 = 建假会话()
  const 收到内容 = vi.fn()
  const 同步 = 创建会话同步({ 会话: 假.接口, on内容: 收到内容 })
  await 同步.注册('文稿甲', 内容('初始'))
  const 注销 = await 同步.注销()
  expect(注销).toMatchObject({ 成功: true, 是否最后视图: true })
  假.广播({ 类型: '会话变更', 版本: 9, 内容: 内容('之后') })
  expect(收到内容).not.toHaveBeenCalled()
})

it('没有会话身份时不注册，且提交与注销给出真实原因', async () => {
  const 假 = 建假会话()
  const 同步 = 创建会话同步({ 会话: 假.接口 })
  const 接管 = await 同步.接管()
  expect(接管).toMatchObject({ 成功: false })
  expect(接管.错误).toContain('会话')
  expect((await 同步.提交(内容('x'))).成功).toBe(false)
  expect((await 同步.注销()).成功).toBe(false)
})

it('接管其他窗口的文稿身份并读取内容', async () => {
  const 假 = 建假会话()
  假.接口.identity = vi.fn(async () => ({ 成功: true, 文稿标识: '文稿甲', 视图标识: '窗口二' }))
  const 同步 = 创建会话同步({ 会话: 假.接口 })
  const 接管 = await 同步.接管()
  expect(接管).toMatchObject({ 成功: true, 文稿标识: '文稿甲', 版本: 1 })
  expect(假.接口.register).toHaveBeenCalledWith('文稿甲', '窗口二')
  expect(接管.内容).toEqual(内容('初始'))
})
