const { 是合法base64, base64字节数 } = require('./base64')

const 允许图像类型 = new Set(['image/png', 'image/jpeg', 'image/webp'])
const 默认最大字节 = 8 * 1024 * 1024
const 识别提示 = '请提取图片中的全部文字，保持原有换行与顺序；只输出识别到的文字，不要添加解释。'

function 解码图像(输入, 最大字节) {
  if (!输入 || typeof 输入 !== 'object') throw new Error('识别图片参数无效')
  if (!允许图像类型.has(输入.类型)) throw new Error('识别图片格式不支持：只接受 PNG、JPEG 或 WebP')
  if (typeof 输入.数据 !== 'string' || 输入.数据.length === 0) throw new Error('识别图片为空，请重新截图或选择图片')
  const 字节数 = base64字节数(输入.数据)
  if (字节数 <= 0) throw new Error('识别图片为空，请重新截图或选择图片')
  if (字节数 > 最大字节) throw new Error(`识别图片超过大小限制：${字节数} 字节`)
  if (!是合法base64(输入.数据)) throw new Error('识别图片编码无效')
  return { 类型: 输入.类型, 数据: 输入.数据, 字节数 }
}

/** 识别能力完全依赖共用助手服务；这里不读取密钥，也不建立第二套设置。 */
function 创建识别服务(选项 = {}) {
  const 助手服务 = 选项.助手服务
  if (!助手服务 || typeof 助手服务.读取配置 !== 'function' || typeof 助手服务.对话 !== 'function') {
    throw new Error('识别服务缺少共用助手服务，无法调用模型')
  }
  const 最大字节 = 选项.最大字节 ?? 默认最大字节

  async function 读取状态() {
    try {
      const 配置 = await 助手服务.读取配置()
      if (!配置?.地址 || !配置?.模型) return { 可用: false, 原因: '请先在设置中心配置模型服务，并选择支持图像输入的模型' }
      if (配置.服务商 && 配置.服务商 !== 'custom' && !配置.已配置密钥) return { 可用: false, 原因: '请先填写所选服务商的 API 密钥' }
      return { 可用: true, 模型: 配置.模型, 说明: '需要模型支持图像输入；当前配置的模型是否支持由模型服务决定' }
    } catch (错误) {
      return { 可用: false, 原因: 错误 instanceof Error ? 错误.message : '模型设置读取失败' }
    }
  }

  async function 识别(输入, { 信号 } = {}) {
    const 图像 = 解码图像(输入, 最大字节)
    const 结果 = await 助手服务.对话({
      用途: '识别',
      消息: [{ 角色: 'user', 内容: 识别提示, 图像: [{ 类型: 图像.类型, 数据: 图像.数据 }] }],
      文档上下文: '',
    }, { 信号 })
    const 文本 = typeof 结果?.内容 === 'string' ? 结果.内容.trim() : ''
    if (!文本) throw new Error('模型未返回识别文字，请确认所选模型支持图像输入后重试')
    return { 文本 }
  }

  return { 读取状态, 识别 }
}

module.exports = { 创建识别服务, 允许图像类型, 识别提示 }
