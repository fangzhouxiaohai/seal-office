import { 原生插入命令 } from './commands/insert'
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
  移动幻灯片,
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
  /** 当前功能无法可靠保存时，用统一弹窗说明限制。 */
  提示功能限制?: (标题: string, 内容: string) => void
  切换视图?: (视图: '普通' | '浏览' | '备注') => void
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

/** 读取当前选中的文本框；未选中时回退到最近选中的文本框 */
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

/** 对当前选中文本框应用整框统一样式（无文本选区时的回退） */
function 应用整框样式(上下文: 演示命令上下文, 样式: Partial<文本框>): void {
  const 当前 = 读取当前幻灯片(上下文.文稿)
  if (当前 === null || 上下文.选中框标识 === null) {
    上下文.notify('请先在画布中选中一个文本框')
    return
  }
  // 应用整框样式时清空既有片段列表，使新样式统一生效
  上下文.更新文稿(
    更新幻灯片(上下文.文稿, 当前.id, {
      文本框列表: 更新文本框(当前, 上下文.选中框标识, { ...样式, 片段列表: undefined }).文本框列表,
    })
  )
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

/** 剪贴板缓存：跨命令暂存最近一次复制的文本框 */
let 剪贴板缓存: 文本框 | null = null

/** 应用背景色到当前幻灯片（design.background 与 slide.background 共用） */
function 应用背景色命令(上下文: 演示命令上下文, 参数?: string): void {
  const 当前 = 读取当前幻灯片(上下文.文稿)
  if (当前 === null) {
    return
  }
  const 颜色 = 背景映射[参数 ?? '白色'] ?? '#FFFFFF'
  上下文.更新文稿(更新幻灯片(上下文.文稿, 当前.id, { 背景色: 颜色 }))
  上下文.notify(`已将背景改为${参数 ?? '白色'}`)
}

/** 应用版式到当前幻灯片（design.layout 与 slide.layout 共用） */
function 应用版式命令(上下文: 演示命令上下文, 参数?: string): void {
  const 当前 = 读取当前幻灯片(上下文.文稿)
  if (当前 === null) {
    return
  }
  const 版式 = (参数 ?? '标题和内容') as 版式类型
  上下文.更新文稿(应用版式(上下文.文稿, 当前.id, 版式))
  上下文.notify(`已应用「${版式}」版式`)
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
        // 无文本选区时回退为整框统一样式
        应用整框样式(上下文, { 颜色 })
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
        // 无文本选区时回退为整框统一样式
        应用整框样式(上下文, { 加粗: true })
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
        // 无文本选区时回退为整框统一样式
        应用整框样式(上下文, { 斜体: true })
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
        // 无文本选区时回退为整框统一样式
        应用整框样式(上下文, { 下划线: true })
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
  { id: 'design.background', label: '背景色', run: 应用背景色命令 },
  { id: 'design.layout', label: '版式', run: 应用版式命令 },
  // 右键菜单命令：与设计标签行为一致，但命令标识不同，需单独注册
  { id: 'slide.background', label: '设置背景', run: 应用背景色命令 },
  { id: 'slide.layout', label: '版式', run: 应用版式命令 },
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
  {
    id: 'slide.moveUp',
    label: '上移',
    run: (上下文) => {
      const 新文稿 = 移动幻灯片(上下文.文稿, -1)
      if (新文稿 === 上下文.文稿) {
        上下文.notify('已是第一张幻灯片')
        return
      }
      上下文.更新文稿(新文稿)
    },
  },
  {
    id: 'slide.moveDown',
    label: '下移',
    run: (上下文) => {
      const 新文稿 = 移动幻灯片(上下文.文稿, 1)
      if (新文稿 === 上下文.文稿) {
        上下文.notify('已是最后一张幻灯片')
        return
      }
      上下文.更新文稿(新文稿)
    },
  },
  {
    id: 'clipboard.copy',
    label: '复制',
    run: (上下文) => {
      const 框 = 取选中框(上下文)
      if (框 === null) {
        上下文.notify('请先在画布中选中一个文本框')
        return
      }
      剪贴板缓存 = {
        ...框,
        片段列表: 框.片段列表 ? 框.片段列表.map((片段) => ({ ...片段 })) : undefined,
      }
      上下文.notify('已复制文本框')
    },
  },
  {
    id: 'clipboard.paste',
    label: '粘贴',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null || 剪贴板缓存 === null) {
        上下文.notify('剪贴板为空，请先复制文本框')
        return
      }
      const 源 = 剪贴板缓存
      const 新框 = 创建文本框(源.x, 源.y, 源.width, 源.height, 源.text, 源.字号)
      新框.加粗 = 源.加粗
      新框.斜体 = 源.斜体
      新框.下划线 = 源.下划线
      新框.字体 = 源.字体
      新框.颜色 = 源.颜色
      新框.对齐 = 源.对齐
      if (源.片段列表 && 源.片段列表.length > 0) {
        新框.片段列表 = 源.片段列表.map((片段) => ({ ...片段 }))
      }
      上下文.更新文稿(
        更新幻灯片(上下文.文稿, 当前.id, {
          文本框列表: [...当前.文本框列表, 新框],
        })
      )
      上下文.notify('已粘贴文本框')
    },
  },
  {
    id: 'transition.fade',
    label: '淡入淡出',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(更新幻灯片(上下文.文稿, 当前.id, { 过渡效果: '淡入淡出' }))
      上下文.notify('已设置过渡效果：淡入淡出')
    },
  },
  {
    id: 'transition.push',
    label: '推进',
    run: (上下文) => {
      const 当前 = 读取当前幻灯片(上下文.文稿)
      if (当前 === null) return
      上下文.更新文稿(更新幻灯片(上下文.文稿, 当前.id, { 过渡效果: '推进' }))
      上下文.notify('已设置过渡效果：推进')
    },
  },
  {
    id: 'animation.appear',
    label: '出现',
    run: (上下文) => {
      const 内容 = '当前版本无法可靠保存演示动画到 PPTX 文件，本次未应用“出现”效果。'
      if (上下文.提示功能限制) 上下文.提示功能限制('动画功能受限', 内容)
      else 上下文.notify(内容)
    },
  },
  {
    id: 'animation.fade',
    label: '淡出',
    run: (上下文) => {
      const 内容 = '当前版本无法可靠保存演示动画到 PPTX 文件，本次未应用“淡出”效果。'
      if (上下文.提示功能限制) 上下文.提示功能限制('动画功能受限', 内容)
      else 上下文.notify(内容)
    },
  },
  {
    id: 'slideshow.start',
    label: '从头开始',
    run: (上下文) => {
      上下文.更新文稿(切换幻灯片(上下文.文稿, 0))
      上下文.notify('已从头开始放映，请在放映视图播放')
    },
  },
  {
    id: 'slideshow.current',
    label: '从当前开始',
    run: (上下文) => {
      上下文.notify('已准备从当前幻灯片开始放映，请在放映视图播放')
    },
  },
  {
    id: 'review.spell',
    label: '拼写检查',
    run: (上下文) => 上下文.notify('拼写检查功能将在后续版本接入，将逐词校验幻灯片文本并给出建议'),
  },
  {
    id: 'review.comment',
    label: '新建批注',
    run: (上下文) => 上下文.notify('新建批注功能将在后续版本接入，可在幻灯片任意位置添加批注'),
  },
  {
    id: 'insert.chart',
    label: '图表',
    run: (上下文) => 上下文.notify('图表功能需要高级图表编辑能力，将在后续版本接入'),
  },
  {
    id: 'insert.picture',
    label: '图片',
    run: (上下文) => 上下文.notify('图片插入需要本地图片选择与嵌入能力，将在后续版本接入'),
  },
  {
    id: 'insert.table',
    label: '表格',
    run: (上下文) => 上下文.notify('表格插入需要表格编辑组件，将在后续版本接入'),
  },
  {
    id: 'insert.media',
    label: '音频与视频',
    run: (上下文) => 上下文.notify('音视频插入需要媒体播放与嵌入能力，将在后续版本接入'),
  },
  {
    id: 'view.normal',
    label: '普通',
    run: (上下文) => 上下文.切换视图?.('普通'),
  },
  {
    id: 'view.slideSorter',
    label: '幻灯片浏览',
    run: (上下文) => 上下文.切换视图?.('浏览'),
  },
  {
    id: 'view.notes',
    label: '备注页',
    run: (上下文) => 上下文.切换视图?.('备注'),
  },
]

export const 演示命令表: Record<string, 演示命令> = 命令列表.reduce<
  Record<string, 演示命令>
>((累计, 命令) => {
  累计[命令.id] = 命令
  return 累计
}, {})
原生插入命令.forEach(命令 => { 演示命令表[命令.id] = 命令 })

/** 尚未实现的演示命令：当前全部命令均已接入，或在命令注册表中给出明确中文指引 */
export const 演示未实现清单: Array<[string, string]> = []

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
