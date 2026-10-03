export function 下载本地内容(文件名: string, 内容: string, 类型: string): void {
  const 地址 = URL.createObjectURL(new Blob([内容], { type: 类型 }))
  const 链接 = document.createElement('a')
  链接.href = 地址
  链接.download = 文件名
  document.body.appendChild(链接)
  链接.click()
  链接.remove()
  window.setTimeout(() => URL.revokeObjectURL(地址), 1000)
}
