// 审阅命令：本机排版检查、批注入口与导航、繁简转换。智能语义校对属于模型服务，不在本文件冒充。
import type { 演示命令 } from '../pptCommands'
import { 执行本机检查 } from '../model/proofing'

export const 审阅命令: 演示命令[] = [
  {
    id: 'review.spell',
    label: '排版检查',
    run: (上下文) => {
      const 项列表 = 执行本机检查(上下文.文稿)
      上下文.打开审阅?.('检查')
      上下文.notify(项列表.length ? `本机排版检查发现 ${项列表.length} 项，请在审阅面板逐条确认` : '本机排版检查未发现问题')
    },
  },
  {
    id: 'review.comment',
    label: '新建批注',
    run: (上下文) => {
      上下文.打开审阅?.('批注')
      上下文.notify('请在批注面板填写内容后添加，可关联当前选中的对象')
    },
  },
  { id: 'review.commentPrevious', label: '上一条批注', run: (上下文) => 上下文.跳转批注?.(-1) },
  { id: 'review.commentNext', label: '下一条批注', run: (上下文) => 上下文.跳转批注?.(1) },
  { id: 'review.commentToggle', label: '显示批注', run: (上下文) => 上下文.切换批注显示?.() },
  { id: 'review.langToSimplified', label: '繁转简', run: (上下文) => 上下文.打开审阅?.('转换', '简') },
  { id: 'review.langToTraditional', label: '简转繁', run: (上下文) => 上下文.打开审阅?.('转换', '繁') },
]
