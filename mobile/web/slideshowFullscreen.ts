// 移动宿主已有铺满视口的放映层，系统拒绝全屏时仍可正常放映。
// 普通网页没有宿主容器，拒绝系统全屏应如实报错。
export async function 进入移动放映全屏(doc: Document, 平台: string): Promise<'native' | 'viewport'> {
  const 请求全屏 = doc.documentElement.requestFullscreen
  if (!请求全屏) return 'viewport'
  try {
    await 请求全屏.call(doc.documentElement)
    return 'native'
  } catch (错误) {
    if (平台 === 'android' || 平台 === 'harmony') return 'viewport'
    throw 错误
  }
}
