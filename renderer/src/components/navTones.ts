// 首页导航、应用中心与新建入口共用的色彩分组：每个入口固定一个色调，
// 图标落在同色系的圆角底块上，界面更有层次又不会每次刷新变色。
export type 色调 = 'violet' | 'indigo' | 'blue' | 'sky' | 'teal' | 'green' | 'lime' | 'amber' | 'orange' | 'red' | 'pink' | 'purple' | 'slate'

export const 导航色调: Record<string, 色调> = {
  home: 'violet', doc: 'blue', recent: 'violet', star: 'amber', shared: 'sky',
  'my-cloud': 'blue', knowledge: 'teal', market: 'orange', device: 'indigo', tag: 'pink', team: 'green', trash: 'slate',
  desktop: 'sky', document: 'blue', download: 'teal', browse: 'indigo',
  pdf: 'red', mindmap: 'purple', flow: 'teal', multitable: 'green', design: 'pink', notes: 'amber',
  calendar: 'orange', apps: 'violet', help: 'slate', ai: 'purple', aippt: 'orange', database: 'indigo', settings: 'slate',
  word: 'blue', table: 'green', ppt: 'orange', template: 'violet',
}

export const 取色调 = (键: string): 色调 => 导航色调[键] ?? 'violet'
