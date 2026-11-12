import { beforeEach, describe, expect, it, vi } from 'vitest'

const 云调用 = vi.fn()
vi.mock('../cloud/CloudProvider', () => ({ cloudCall: (...参数: unknown[]) => 云调用(...参数) }))
const 授权 = vi.fn()
vi.mock('../cloud/scanConsent', () => ({ confirmScanUpload: (...参数: unknown[]) => 授权(...参数) }))

import { 识别图片文字, 字节转Base64 } from './recognition'

const 页 = (字节: number[]) => ({ 图片: new Uint8Array(字节), 类型: 'image/jpeg' as const })

describe('扫描识别', () => {
  beforeEach(() => { 云调用.mockReset(); 授权.mockReset() })

  it('识别前先走 scanConsent 授权确认，拒绝时不上传任何图片', async () => {
    授权.mockResolvedValue(false)
    await expect(识别图片文字({}, [页([1, 2, 3])])).rejects.toThrow('已取消识别，图片未上传')
    expect(授权).toHaveBeenCalledTimes(1)
    expect(云调用).not.toHaveBeenCalled()
  })

  it('同意后整批只确认一次，逐张调用现有 ocrImage 通道并带上授权标记', async () => {
    授权.mockResolvedValue(true)
    云调用.mockImplementation(async (_动作: string, 输入: { data: string }) => ({ text: '文字' + 输入.data }))
    const 进度: string[] = []
    const 结果 = await 识别图片文字({}, [页([1]), 页([2])], { 表格: true, 进度: (完成, 总数) => 进度.push(`${完成}/${总数}`) })
    expect(授权).toHaveBeenCalledTimes(1)
    expect(云调用).toHaveBeenNthCalledWith(1, 'ocrImage', { data: 'AQ==', mime: 'image/jpeg', consent: true, layout: 'table' })
    expect(结果).toEqual([{ 文字: '文字AQ==' }, { 文字: '文字Ag==' }])
    expect(进度).toEqual(['0/2', '1/2', '2/2'])
  })

  it('单张失败只记录该张的错误，不影响同批其他图片', async () => {
    授权.mockResolvedValue(true)
    云调用.mockRejectedValueOnce(new Error('识别图片无效或超过 8 MiB')).mockResolvedValueOnce({ text: '第二张' })
    expect(await 识别图片文字({}, [页([1]), 页([2])])).toEqual([{ 错误: '识别图片无效或超过 8 MiB' }, { 文字: '第二张' }])
  })

  it('需要登录等账户类错误直接中止整批，不再逐张重复请求', async () => {
    授权.mockResolvedValue(true)
    云调用.mockRejectedValue(Object.assign(new Error('请先登录'), { 需要登录: true }))
    await expect(识别图片文字({}, [页([1]), 页([2])])).rejects.toThrow('请先登录')
    expect(云调用).toHaveBeenCalledTimes(1)
  })

  it('大字节数组分块转为 Base64', () => {
    const 字节 = new Uint8Array(100000).map((_, 序号) => 序号 % 256)
    expect(字节转Base64(字节)).toBe(Buffer.from(字节).toString('base64'))
  })
})
