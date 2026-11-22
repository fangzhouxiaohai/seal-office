import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'

// 页面统一的异步执行器：防重入、busy 状态、本地校验错误提示
// 服务端错误已由请求拦截器弹窗（带 __handled 标记），这里只提示页面本地抛出的错误
export async function runTask(busy: Ref<boolean>, task: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await task()
  } catch (error) {
    if (!(error as any)?.__handled) {
      ElMessage.error(error instanceof Error ? error.message : '操作失败，请稍后重试')
    }
  } finally {
    busy.value = false
  }
}
