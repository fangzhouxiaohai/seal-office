export interface PDF页来源 { 文件名?: string; 页码?: number; 文字: string; 待识别图块: Blob[] }
export const PDF来源 = new WeakMap<Blob, PDF页来源>()
