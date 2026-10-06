// 翻译配置类型。
// 翻译调用统一经主进程安全服务完成（见 renderer/src/ipc/bridge.ts 的 presentationAi.translate），
// 渲染端不再直接以明文密钥请求外部接口：原先的 fetch 版 翻译文本 已删除，避免留下明文密钥调用面。
export interface 翻译配置 {
  地址: string
  密钥?: string
  来源语言?: string
  目标语言?: string
}
