import { expect, it, vi } from 'vitest'
import { 创建屏幕流, 创建麦克风流, 创建录制会话, 录制媒体类型, 截取视频帧, 解析捕获源标识, 缓冲转base64, 等待画面就绪, type 捕获依赖 } from './capture'

const 假流 = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream

it('校验捕获源标识，拒绝空值与未知类型', () => {
  expect(解析捕获源标识('screen:0:0')).toEqual({ 类型: 'screen', 标识: 'screen:0:0' })
  expect(解析捕获源标识('window:123:0')).toEqual({ 类型: 'window', 标识: 'window:123:0' })
  expect(() => 解析捕获源标识('')).toThrow('捕获源')
  expect(() => 解析捕获源标识('camera:1')).toThrow('捕获源')
})

it('缺少桌面媒体能力时给出真实原因', async () => {
  await expect(创建屏幕流('screen:0:0', { 媒体设备: undefined })).rejects.toThrow('不支持屏幕捕获')
  await expect(创建屏幕流('', { 媒体设备: { getUserMedia: vi.fn() } })).rejects.toThrow('捕获源')
})

it('屏幕流使用桌面捕获约束并透出系统失败原因', async () => {
  const 媒体设备 = { getUserMedia: vi.fn(async (约束: unknown) => { expect(JSON.stringify(约束)).toContain('desktop'); return 假流() }) }
  await expect(创建屏幕流('screen:0:0', { 媒体设备 })).resolves.toBeTruthy()
  媒体设备.getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'))
  await expect(创建屏幕流('window:9:0', { 媒体设备 })).rejects.toThrow('屏幕捕获失败：NotAllowedError')
})

it('麦克风流失败时返回真实原因，系统音频不可用时明确报告', async () => {
  const 媒体设备 = { getUserMedia: vi.fn(async () => 假流()) }
  await expect(创建麦克风流({ 媒体设备 })).resolves.toBeTruthy()
  媒体设备.getUserMedia.mockRejectedValueOnce(new Error('麦克风被占用'))
  await expect(创建麦克风流({ 媒体设备 })).rejects.toThrow('麦克风不可用：麦克风被占用')
})

it('系统隐私授权未处理导致取流不返回时，屏幕与麦克风都在有限时间内报错', async () => {
  const 永不返回 = { getUserMedia: vi.fn(() => new Promise<MediaStream>(() => {})) }
  await expect(创建屏幕流('screen:0:0', { 媒体设备: 永不返回, 屏幕超时毫秒: 30 })).rejects.toThrow('屏幕捕获等待超时')
  await expect(创建麦克风流({ 媒体设备: 永不返回, 麦克风超时毫秒: 30 })).rejects.toThrow('麦克风等待授权超时')
  await expect(创建麦克风流({ 媒体设备: 永不返回, 麦克风超时毫秒: 30 })).rejects.toThrow('系统隐私设置')
})

it('录制媒体类型只报告本机真实支持的编码', () => {
  const 支持 = { isTypeSupported: (类型: string) => 类型.includes('vp8') }
  expect(录制媒体类型({ 录制器构造: class { static isTypeSupported = 支持.isTypeSupported } as never })).toMatchObject({ 支持: true, 媒体类型: expect.stringContaining('webm') })
  expect(录制媒体类型({ 录制器构造: class { static isTypeSupported = () => false } as never })).toMatchObject({ 支持: false, 原因: expect.stringContaining('WebM') })
  expect(录制媒体类型({})).toMatchObject({ 支持: false, 原因: expect.stringContaining('不支持') })
})

it('录制会话完成开始、暂停、继续与停止并返回真实数据块', async () => {
  const 实例 = {
    state: 'inactive',
    开始: null as unknown,
    数据: [] as Blob[],
  }
  class 假录制器 {
    static isTypeSupported = () => true
    state = 'inactive'
    ondataavailable: ((事件: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((事件: unknown) => void) | null = null
    start() { this.state = 'recording' }
    pause() { this.state = 'paused' }
    resume() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['片段'], { type: 'video/webm' }) }); this.onstop?.() }
  }
  const 依赖: 捕获依赖 = { 录制器构造: 假录制器 as never, 现在: () => 1000 }
  const 会话 = 创建录制会话({ 视频流: 假流(), 依赖 })
  expect(会话.状态()).toBe('未开始')
  会话.开始()
  expect(会话.状态()).toBe('录制中')
  会话.暂停()
  expect(会话.状态()).toBe('已暂停')
  会话.继续()
  expect(会话.状态()).toBe('录制中')
  const 结果 = await 会话.停止()
  expect(结果.数据块.size).toBeGreaterThan(0)
  expect(结果.媒体类型).toContain('webm')
  expect(会话.状态()).toBe('已停止')
  void 实例
})

it('没有捕获到数据时停止返回真实失败', async () => {
  class 空录制器 {
    static isTypeSupported = () => true
    ondataavailable: ((事件: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    start() {}
    stop() { this.onstop?.() }
  }
  const 会话 = 创建录制会话({ 视频流: 假流(), 依赖: { 录制器构造: 空录制器 as never } })
  会话.开始()
  await expect(会话.停止()).rejects.toThrow('没有捕获到')
})

it('重复停止与未开始状态被拒绝', async () => {
  class 假录制器 {
    static isTypeSupported = () => true
    ondataavailable: ((事件: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    start() {}
    stop() { this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.() }
  }
  const 会话 = 创建录制会话({ 视频流: 假流(), 依赖: { 录制器构造: 假录制器 as never } })
  await expect(会话.停止()).rejects.toThrow('尚未开始')
  会话.开始()
  await 会话.停止()
  await expect(会话.停止()).rejects.toThrow('已经停止')
})

it('截取视频帧按区域裁剪并校验画面就绪状态', async () => {
  const 画布 = {
    width: 0, height: 0, 绘制参数: [] as unknown[],
    getContext: () => ({ drawImage: (...参数: unknown[]) => { 画布.绘制参数 = 参数 } }),
    toDataURL: () => 'data:image/png;base64,QUJD',
  }
  const 依赖: 捕获依赖 = { 画布工厂: () => 画布 as never }
  const 视频 = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement
  const 结果 = await 截取视频帧(视频, { x: 100, y: 50, 宽: 300, 高: 200 }, 依赖)
  expect(结果).toEqual({ 数据: 'QUJD', 类型: 'image/png', 宽: 300, 高: 200 })
  expect(画布.width).toBe(300)
  expect(画布.height).toBe(200)
  await expect(截取视频帧({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, { x: 0, y: 0, 宽: 10, 高: 10 }, 依赖)).rejects.toThrow('画面尚未就绪')
  await expect(截取视频帧(视频, { x: 0, y: 0, 宽: 0, 高: 10 }, 依赖)).rejects.toThrow('裁剪区域')
  await expect(截取视频帧(视频, { x: 1900, y: 0, 宽: 800, 高: 100 }, 依赖)).resolves.toMatchObject({ 宽: 20 })
})

it('画布不可用时报告真实原因', async () => {
  const 依赖: 捕获依赖 = { 画布工厂: () => ({ width: 0, height: 0, getContext: () => null, toDataURL: () => '' }) as never }
  await expect(截取视频帧({ videoWidth: 100, videoHeight: 100 } as HTMLVideoElement, { x: 0, y: 0, 宽: 10, 高: 10 }, 依赖)).rejects.toThrow('不支持画面截取')
})

it('大录制内容分批转 base64，不因展开超长数组而溢出', () => {
  const 缓冲 = new Uint8Array(3 * 1024 * 1024).fill(7).buffer
  const 结果 = 缓冲转base64(缓冲)
  expect(结果.length).toBe(Math.ceil(缓冲.byteLength / 3) * 4)
  expect(结果.startsWith('BwcH')).toBe(true)
  expect(() => 缓冲转base64(new ArrayBuffer(0))).toThrow('为空')
})

it('等待画面就绪在视频尺寸可用时立即返回，元数据缺失时如实报错', async () => {
  await expect(等待画面就绪({ videoWidth: 1280, videoHeight: 720 })).resolves.toBeUndefined()
  await expect(等待画面就绪({ videoWidth: 0, videoHeight: 0 })).rejects.toThrow('画面尚未就绪')
})
