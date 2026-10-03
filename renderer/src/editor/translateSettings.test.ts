import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 读取翻译配置, 保存翻译配置, 已配置翻译服务 } from './translateSettings'

const 存储键 = 'seal.office.translate'

describe('翻译设置持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未保存时返回空配置且视为未配置服务', () => {
    const 配置 = 读取翻译配置()
    expect(配置.地址).toBe('')
    expect(已配置翻译服务(配置)).toBe(false)
  })

  it('保存后可读取到地址与密钥', () => {
    保存翻译配置({ 地址: 'https://api.example.com/translate', 密钥: 'secret-key' })
    const 配置 = 读取翻译配置()
    expect(配置.地址).toBe('https://api.example.com/translate')
    expect(配置.密钥).toBe('secret-key')
  })

  it('已保存地址时视为已配置服务', () => {
    保存翻译配置({ 地址: 'https://api.example.com/translate' })
    expect(已配置翻译服务(读取翻译配置())).toBe(true)
  })

  it('仅保存空地址时仍视为未配置服务', () => {
    保存翻译配置({ 地址: '   ' })
    expect(已配置翻译服务(读取翻译配置())).toBe(false)
  })

  it('使用指定存储键写入 localStorage', () => {
    保存翻译配置({ 地址: 'https://a.example.com' })
    expect(localStorage.getItem(存储键)).toContain('https://a.example.com')
  })

  it('本机存储不可写时显式报告保存失败', () => {
    const 写入 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('存储拒绝写入') })
    try {
      expect(() => 保存翻译配置({ 地址: 'https://a.example.com' })).toThrow('存储拒绝写入')
    } finally {
      写入.mockRestore()
    }
  })

  it('已有配置损坏时报告错误而不当作未配置', () => {
    localStorage.setItem(存储键, '{损坏')
    expect(() => 读取翻译配置()).toThrow('翻译设置内容已损坏')
  })

  it('本机存储无法读取时报告原始错误', () => {
    const 读取 = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('存储拒绝读取') })
    try {
      expect(() => 读取翻译配置()).toThrow('存储拒绝读取')
    } finally {
      读取.mockRestore()
    }
  })
})
