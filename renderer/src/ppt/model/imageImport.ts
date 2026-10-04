/** 在任何文稿修改前解码真实图片；不接受无法识别的文件作为占位图。 */
export async function 解码图片文件(文件: File): Promise<{ 数据: string; 类型: string; 宽: number; 高: number }> {
  if (!文件.size || 文件.size > 50 * 1024 * 1024) throw new Error(`图片 ${文件.name} 为空或超过 50 MB 限制`)
  const 地址 = await new Promise<string>((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => typeof 读取器.result === 'string' ? 完成(读取器.result) : 失败(new Error('图片读取结果无效'))
    读取器.onerror = () => 失败(new Error(`图片 ${文件.name} 无法读取`))
    读取器.readAsDataURL(文件)
  })
  const 数据 = 地址.slice(地址.indexOf(',') + 1), 字节 = atob(数据)
  const 类型 = 字节.charCodeAt(0) === 137 && 字节.slice(1,4) === 'PNG' ? 'image/png' : 字节.charCodeAt(0) === 255 && 字节.charCodeAt(1) === 216 ? 'image/jpeg' : null
  if (!类型) throw new Error(`图片 ${文件.name} 格式不受支持；请选择 PNG 或 JPEG 图片`)
  const 尺寸 = await new Promise<{ 宽: number; 高: number }>((完成, 失败) => {
    const 图像 = new Image()
    图像.onload = () => 图像.naturalWidth > 0 && 图像.naturalHeight > 0 ? 完成({ 宽: 图像.naturalWidth, 高: 图像.naturalHeight }) : 失败(new Error(`图片 ${文件.name} 尺寸无效`))
    图像.onerror = () => 失败(new Error(`图片 ${文件.name} 数据已损坏，无法解码`))
    图像.src = `data:${类型};base64,${数据}`
  })
  return { 数据, 类型, ...尺寸 }
}
