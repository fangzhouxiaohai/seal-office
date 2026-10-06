import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 读取翻译配置, 保存翻译配置, 清除翻译配置, 已配置翻译服务 } from './translateSettings'

const 存储键 = 'seal.office.translate'
const 明文密钥 = 'sk-plaintext-secret-123'

/** 用假的后端接口模拟系统安全存储；未提供时视为浏览器环境（无安全存储） */
const 安装安全存储 = (覆盖: Record<string, unknown> = {}) => {
  const 保存 = vi.fn(async () => ({ 成功: true, 数据: { 地址: '', 已配置密钥: true } }))
  const 读取 = vi.fn(async () => ({ 成功: true, 数据: { 地址: 'https://api.example.com/translate', 目标语言: 'zh', 已配置密钥: true } }))
  const 清除 = vi.fn(async () => ({ 成功: true }))
  const 迁移 = vi.fn(async () => ({ 成功: true, 数据: { 成功: true, 目标语言: 'zh' } }))
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { presentationAi: { capabilities: vi.fn(), getService: 读取, saveService: 保存, clearService: 清除, migrateLegacyTranslate: 迁移, ...覆盖 } },
  })
  return { 保存, 读取, 清除, 迁移 }
}

beforeEach(() => {
  localStorage.clear()
  Reflect.deleteProperty(window, 'electronAPI')
})

describe('翻译设置安全存储', () => {
  it('密钥不写入 localStorage 明文，只写系统安全存储', async () => {
    const { 保存 } = 安装安全存储()
    await 保存翻译配置({ 地址: 'https://api.example.com/translate', 密钥: 明文密钥, 目标语言: 'en' })
    const 原文 = localStorage.getItem(存储键) ?? ''
    expect(原文).not.toContain(明文密钥)
    expect(原文).not.toContain('密钥')
    expect(原文).toContain('https://api.example.com/translate')
    expect(保存).toHaveBeenCalledWith('翻译', expect.objectContaining({ 地址: 'https://api.example.com/translate', 目标语言: 'en', 密钥: 明文密钥 }))
  })

  it('读取只回显已配置密钥状态，不回显明文', async () => {
    安装安全存储()
    await 保存翻译配置({ 地址: 'https://api.example.com/translate', 密钥: 明文密钥 })
    const 配置 = await 读取翻译配置()
    expect(配置.地址).toBe('https://api.example.com/translate')
    expect(配置.密钥).toBe('')
    expect(配置.已配置密钥).toBe(true)
    expect(已配置翻译服务(配置)).toBe(true)
    expect(JSON.stringify(配置)).not.toContain(明文密钥)
  })

  it('首次读取时迁移旧明文密钥，校验成功后才清除明文', async () => {
    const { 迁移 } = 安装安全存储()
    localStorage.setItem(存储键, JSON.stringify({ 地址: 'https://old.example.com', 密钥: 明文密钥, 目标语言: 'ja' }))
    const 配置 = await 读取翻译配置()
    expect(迁移).toHaveBeenCalledWith({ 地址: 'https://old.example.com', 密钥: 明文密钥, 目标语言: 'ja' })
    const 原文 = localStorage.getItem(存储键) ?? ''
    expect(原文).not.toContain(明文密钥)
    expect(JSON.parse(原文)).toMatchObject({ 地址: 'https://old.example.com', 目标语言: 'ja' })
    expect(配置.密钥).toBe('')
  })

  it('迁移失败时保留旧明文并给出真实原因，不假装成功', async () => {
    安装安全存储({ migrateLegacyTranslate: vi.fn(async () => ({ 成功: false, 错误: '系统安全存储不可用' })) })
    localStorage.setItem(存储键, JSON.stringify({ 地址: 'https://old.example.com', 密钥: 明文密钥, 目标语言: 'zh' }))
    await expect(读取翻译配置()).rejects.toThrow('系统安全存储不可用')
    expect(localStorage.getItem(存储键) ?? '').toContain(明文密钥)
  })

  it('迁移接口返回未成功时同样保留旧明文', async () => {
    安装安全存储({ migrateLegacyTranslate: vi.fn(async () => ({ 成功: true, 数据: { 成功: false, 原因: '写入后校验不一致' } })) })
    localStorage.setItem(存储键, JSON.stringify({ 地址: 'https://old.example.com', 密钥: 明文密钥 }))
    await expect(读取翻译配置()).rejects.toThrow('写入后校验不一致')
    expect(localStorage.getItem(存储键) ?? '').toContain(明文密钥)
  })

  it('没有安全存储时保存密钥明确报错，不回退写入明文', async () => {
    await expect(保存翻译配置({ 地址: 'https://api.example.com', 密钥: 明文密钥 })).rejects.toThrow('安全存储')
    expect(localStorage.getItem(存储键) ?? '').not.toContain(明文密钥)
  })

  it('没有安全存储时仍可保存非敏感的地址与目标语言', async () => {
    await 保存翻译配置({ 地址: 'https://api.example.com/translate', 目标语言: 'en' })
    const 原文 = localStorage.getItem(存储键) ?? ''
    expect(原文).toContain('https://api.example.com/translate')
    expect(await 读取翻译配置()).toMatchObject({ 地址: 'https://api.example.com/translate', 已配置密钥: false })
  })

  it('清除配置同时清除非敏感设置与安全存储', async () => {
    const { 清除 } = 安装安全存储()
    localStorage.setItem(存储键, JSON.stringify({ 地址: 'https://a.example.com' }))
    await 清除翻译配置()
    expect(localStorage.getItem(存储键)).toBeNull()
    expect(清除).toHaveBeenCalledWith('翻译')
  })

  it('未保存时返回空配置且视为未配置服务', async () => {
    const 配置 = await 读取翻译配置()
    expect(配置.地址).toBe('')
    expect(配置.已配置密钥).toBe(false)
    expect(已配置翻译服务(配置)).toBe(false)
  })

  it('仅保存空地址时仍视为未配置服务', async () => {
    await 保存翻译配置({ 地址: '   ' })
    expect(已配置翻译服务(await 读取翻译配置())).toBe(false)
  })

  it('损坏的旧配置给出真实原因而不是当作未配置', async () => {
    localStorage.setItem(存储键, '{损坏')
    await expect(读取翻译配置()).rejects.toThrow('翻译设置内容已损坏')
  })

  it('旧配置格式无效时给出真实原因', async () => {
    localStorage.setItem(存储键, JSON.stringify({ 地址: 123 }))
    await expect(读取翻译配置()).rejects.toThrow('翻译设置格式无效')
  })

  it('本机存储不可写时显式报告保存失败', async () => {
    const 写入 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('存储拒绝写入') })
    try {
      await expect(保存翻译配置({ 地址: 'https://a.example.com', 目标语言: 'zh' })).rejects.toThrow('存储拒绝写入')
    } finally {
      写入.mockRestore()
    }
  })
})
