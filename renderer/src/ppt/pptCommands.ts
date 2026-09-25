// 演示文稿命令注册表：Ribbon 按钮只派发命令标识，行为集中在此文件。
import {
  创建文本框,
  应用版式,
  删除幻灯片,
  复制幻灯片,
  添加幻灯片,
  更新幻灯片,
  更新文本框,
  切换幻灯片,
  读取当前幻灯片,
  文本转片段,
  检测选中片段,
  应用格式到选中片段,
  type 版式类型,
  type 文本框,
  type 文本片段,
  type 演示文稿,
} from './deck'

export interface 演示命令上下文 {
  文稿: 演示文稿
  /** 当前选中的文本框标识 */
  选中框标识: string | null
  /** 选区在文本中的起始偏移 */
  选中起始?: number
  /** 选区在文本中的结束偏移 */
  选中结束?: number
  /** 下拉框打开时保存的选区快照，用于颜色等命令执行时回退 */
  选区快照?: { 起始?: number; 结束?: number } | null
  更新文稿: (文稿: 演示文稿) => void
  notify: (文本: string) => void
  /** 撤销与重做由容器实现，命令只负责派发 */
  撤销: () => void
  重做: () => void
}

export interface 演示命令 {
  id: string
  label: string
  run: (上下文: 演示命令上下文, 参数?: string) => void
}

/** 尚未实现的功能：按钮就位，点击给出中文提示 */
export function 未实现演示命令(id: string, label: string): 演示命令 {
  return {
    id,
    label,
    run: (上下文) => 上下文.notify('该功能开发中'),
  }
}

/** 读取当前选中的文本框；未选中时返回 null */
export function 取选中框(上下文: 演示命令上下文): 文本框 | null {
  const 当前 = 读取当前幻灯片(上下文.文稿)
  if (当前 === null || 上下文.选中框标识 === null) {
    return null
  }
  return 当前.文本框列表.find((项) => 项.id === 上下文.选中框标识) ?? null
}

/** 对当前选中文本框应用修改 */
function 修改选中框(
  id: string,
  label: string,
  生成修改: (上下文: 演示命令上下文, 参数?: string) => Record<string, unknown>
): 演示命令 {
  return {
    id,
    label,
    run: (上下文, 参数) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null || 上下文.选中框标识 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: 更新文本框(当前, 上下文.选中框标识, 生成修改(上下文, 参数) as never)
            .文本框列表,
        })
      )
      上下文.notify(`已应用${label}`)
    },
  }
}

const 对齐映射: Record<string, 'left' | 'center' | 'right'> = {
  'para.alignLeft': 'left',
  'para.alignCenter': 'center',
  'para.alignRight': 'right',
}

const 背景映射: Record<string, string> = {
  白色: '#FFFFFF',
  浅蓝: '#EEF3FF',
  浅绿: '#EAF7F1',
  浅灰: '#F5F7FA',
  深色: '#1F2733',
}

const 命令列表: 演示命令[] = [
  { id: 'edit.undo', label: '撤销', run: (上下文) => 上下文.撤销() },
  { id: 'edit.redo', label: '重做', run: (上下文) => 上下文.重做() },
  {
    id: 'slide.new',
    label: '新建幻灯片',
    run: (上下文) => {
      上下文.更新文稿(添加幻灯片(上下文.文稿))
      上下文.notify('已新建幻灯片')
    },
  },
  {
    id: 'slide.duplicate',
    label: '复制幻灯片',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) {
        return
      }
      上下文.更新文稿(复制幻灯片(上下文.文稿, 当前.id))
      上下文.notify('已复制幻灯片')
    },
  },
  {
    id: 'slide.delete',
    label: '删除幻灯片',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) {
        return
      }
      const 新文稿 = 删除幻灯片(上下文.文稿, 当前.id)
      if (新文稿 === 上下文.文稿) {
        上下文.notify('至少需要保留一张幻灯片')
        return
      }
      上下文.更新文稿(新文稿)
      上下文.notify('已删除幻灯片')
    },
  },
  {
    id: 'box.new',
    label: '文本框',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) {
        return
      }
      const 框 = 创建文本框(160, 180, 640, 160, '单击此处添加文本', 24)
      const 新幻灯片 = {
        ...当前,
        文本框列表: [...当前.文本框列表, 框],
      }
      上下文.更新文稿(更新幻灯片(上下文.文稿, 当前.id, 新幻灯片))
      上下文.notify('已插入文本框')
    },
  },
  修改选中框('text.bold', '加粗', () => ({ 加粗: true })),
  修改选中框('text.italic', '斜体', () => ({ 斜体: true })),
  修改选中框('text.underline', '下划线', () => ({ 下划线: true })),
  修改选中框('text.color', '字体颜色', (参数) => ({ 颜色: 参数 ?? '#E34D59' })),
  // 字号按当前值增减，而不是固定赋值，避免出现「点增大反而变小」
  修改选中框('text.sizeUp', '增大字号', (上下文) => ({
    字号: Math.min(96, (取选中框(上下文)?.字号 ?? 24) + 4),
  })),
  修改选中框('text.sizeDown', '减小字号', (上下文) => ({
    字号: Math.max(10, (取选中框(上下文)?.字号 ?? 24) - 4),
  })),
  修改选中框('para.alignLeft', '左对齐', () => ({ 对齐: 对齐映射['para.alignLeft'] })),
  修改选中框('para.alignCenter', '居中', () => ({ 对齐: 对齐映射['para.alignCenter'] })),
  修改选中框('para.alignRight', '右对齐', () => ({ 对齐: 对齐映射['para.alignRight'] })),
  // 选中文本片段格式化命令
  {
    id: 'text.color',
    label: '字体颜色',
    run: (上下文, 参数) => {
      const 颜色 = 参数 ?? '#E34D59'
      const 框 = 取选中框(上下文)
      if (框 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      const 框与片段 = 确保有片段(框)
      // 当前选区为空时回退到下拉框打开时保存的快照
      const 起始 = 上下文.选中起始 ?? 上下文.选区快照?.起始
      const 结束 = 上下文.选中结束 ?? 上下文.选区快照?.结束
      const 选中范围 = 检测选中片段(框与片段.片段列表, 起始, 结束)
      if (选中范围 === null) {
        上下文.notify('请先选中要修改的文字')
        return
      }
      const 新框 = 应用格式到选中片段(框与片段, 选中范围.起始索引, 选中范围.结束索引, { 颜色 })
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: 更新文本框(当前, 框.id, { 片段列表: 新框.片段列表, text: 新框.text }).文本框列表,
        })
      )
    },
  },
  {
    id: 'text.bold',
    label: '加粗',
    run: (上下文) => {
      const 框 = 取选中框(上下文)
      if (框 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      const 框与片段 = 确保有片段(框)
      const 起始 = 上下文.选中起始 ?? 上下文.选区快照?.起始
      const 结束 = 上下文.选中结束 ?? 上下文.选区快照?.结束
      const 选中范围 = 检测选中片段(框与片段.片段列表, 起始, 结束)
      if (选中范围 === null) {
        上下文.notify('请先选中要修改的文字')
        return
      }
      const 新框 = 应用格式到选中片段(框与片段, 选中范围.起始索引, 选中范围.结束索引, { 加粗: true })
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: 更新文本框(当前, 框.id, { 片段列表: 新框.片段列表, text: 新框.text }).文本框列表,
        })
      )
    },
  },
  {
    id: 'text.italic',
    label: '斜体',
    run: (上下文) => {
      const 框 = 取选中框(上下文)
      if (框 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      const 框与片段 = 确保有片段(框)
      const 起始 = 上下文.选中起始 ?? 上下文.选区快照?.起始
      const 结束 = 上下文.选中结束 ?? 上下文.选区快照?.结束
      const 选中范围 = 检测选中片段(框与片段.片段列表, 起始, 结束)
      if (选中范围 === null) {
        上下文.notify('请先选中要修改的文字')
        return
      }
      const 新框 = 应用格式到选中片段(框与片段, 选中范围.起始索引, 选中范围.结束索引, { 斜体: true })
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: 更新文本框(当前, 框.id, { 片段列表: 新框.片段列表, text: 新框.text }).文本框列表,
        })
      )
    },
  },
  {
    id: 'text.underline',
    label: '下划线',
    run: (上下文) => {
      const 框 = 取选中框(上下文)
      if (框 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      const 框与片段 = 确保有片段(框)
      const 起始 = 上下文.选中起始 ?? 上下文.选区快照?.起始
      const 结束 = 上下文.选中结束 ?? 上下文.选区快照?.结束
      const 选中范围 = 检测选中片段(框与片段.片段列表, 起始, 结束)
      if (选中范围 === null) {
        上下文.notify('请先选中要修改的文字')
        return
      }
      const 新框 = 应用格式到选中片段(框与片段, 选中范围.起始索引, 选中范围.结束索引, { 下划线: true })
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: 更新文本框(当前, 框.id, { 片段列表: 新框.片段列表, text: 新框.text }).文本框列表,
        })
      )
    },
  },
  {
    id: 'design.background',
    label: '背景色',
    run: (上下文, 参数) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) {
        return
      }
      const 颜色 = 背景映射[参数 ?? '白色'] ?? '#FFFFFF'
      上下文.更新文稿(更新幻灯片(上下文.文稿, 当前.id, { 背景色: 颜色 }))
      上下文.notify(`已将背景改为${参数 ?? '白色'}`)
    },
  },
  {
    id: 'design.layout',
    label: '版式',
    run: (上下文, 参数) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) {
        return
      }
      const 版式 = (参数 ?? '标题和内容') as 版式类型
      上下文.更新文稿(应用版式(上下文.文稿, 当前.id, 版式))
      上下文.notify(`已应用「${版式}」版式`)
    },
  },
  {
    id: 'view.prev',
    label: '上一张',
    run: (上下文) => {
      const 新文稿 = 切换幻灯片(上下文.文稿, 上下文.文稿.当前索引 - 1)
      if (新文稿 === 上下文.文稿) {
        上下文.notify('已是第一张幻灯片')
        return
      }
      上下文.更新文稿(新文稿)
    },
  },
  {
    id: 'view.next',
    label: '下一张',
    run: (上下文) => {
      const 新文稿 = 切换幻灯片(上下文.文稿, 上下文.文稿.当前索引 + 1)
      if (新文稿 === 上下文.文稿) {
        上下文.notify('已是最后一张幻灯片')
        return
      }
      上下文.更新文稿(新文稿)
    },
  },
]

export const 演示命令表: Record<string, 演示命令> = 命令列表.reduce<
  Record<string, 演示命令>
>((累计, 命令) => {
  累计[命令.id] = 命令
  return 累计
}, {})

/** 尚未实现的演示命令 */
export const 演示未实现清单: Array<[string, string]> = [
  ['clipboard.copy', '复制'],
  ['clipboard.paste', '粘贴'],
  ['transition.fade', '淡入淡出'],
  ['transition.push', '推进'],
  ['animation.appear', '出现'],
  ['animation.fade', '淡出'],
  ['slideshow.start', '从头开始'],
  ['slideshow.current', '从当前开始'],
  ['review.spell', '拼写检查'],
  ['review.comment', '新建批注'],
  ['insert.chart', '图表'],
  ['insert.picture', '图片'],
  ['insert.table', '表格'],
  ['insert.media', '音频与视频'],
  ['view.slideSorter', '幻灯片浏览'],
  ['view.notes', '备注页'],
]

演示未实现清单.forEach(([id, label]) => {
  演示命令表[id] = 未实现演示命令(id, label)
})

export const 演示命令标识列表: string[] = Object.keys(演示命令表)

export function 查找演示命令(id: string): 演示命令 | undefined {
  return 演示命令表[id]
}

/** 将纯文本文本框转换为带片段的文本框，用于支持选中文本格式化 */
function 确保有片段(框: 文本框): 文本框 & { 片段列表: 文本片段[] } {
  if (框.片段列表 && 框.片段列表.length > 0) return 框 as 文本框 & { 片段列表: 文本片段[] }
  const 片段列表 = 文本转片段(框.text, 框.字号, 框.加粗, 框.斜体, 框.下划线, 框.颜色)
  return { ...框, 片段列表 } as 文本框 & { 片段列表: 文本片段[] }
}
