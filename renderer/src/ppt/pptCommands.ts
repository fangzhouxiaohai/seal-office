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
  type 版式类型,
  type 演示文稿,
} from './deck'

export interface 演示命令上下文 {
  文稿: 演示文稿
  /** 当前选中的文本框标识 */
  选中框标识: string | null
  更新文稿: (文稿: 演示文稿) => void
  notify: (文本: string) => void
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

/** 对当前选中文本框应用修改 */
function 修改选中框(
  id: string,
  label: string,
  生成修改: (参数?: string) => Record<string, unknown>
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
          文本框列表: 更新文本框(当前, 上下文.选中框标识, 生成修改(参数) as never).文本框列表,
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
  修改选中框('text.sizeUp', '增大字号', () => ({ 字号: 32 })),
  修改选中框('text.sizeDown', '减小字号', () => ({ 字号: 18 })),
  修改选中框('para.alignLeft', '左对齐', () => ({ 对齐: 对齐映射['para.alignLeft'] })),
  修改选中框('para.alignCenter', '居中', () => ({ 对齐: 对齐映射['para.alignCenter'] })),
  修改选中框('para.alignRight', '右对齐', () => ({ 对齐: 对齐映射['para.alignRight'] })),
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
