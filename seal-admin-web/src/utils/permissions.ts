// 管理后台固定的 19 个权限点，与后端 PERMISSIONS 一一对应
export const permissionOptions = [
  ['overview:read', '查看运行概览'],
  ['users:read', '查看用户管理'],
  ['template:read', '查看演示模板'],
  ['template:review', '审核演示模板'],
  ['knowledge:read', '查看知识内容'],
  ['knowledge:review', '审核知识内容'],
  ['skin:read', '查看皮肤'],
  ['skin:review', '审核皮肤'],
  ['audit:read', '查看操作记录'],
  ['converter:read', '查看文档转换'],
  ['converter:write', '管理文档转换'],
  ['releases:read', '查看版本管理'],
  ['releases:write', '发布和管理版本'],
  ['admins:read', '查看管理员'],
  ['admins:write', '管理管理员'],
  ['roles:read', '查看角色'],
  ['roles:write', '管理角色'],
  ['menus:read', '查看菜单'],
  ['menus:write', '编辑菜单']
].map(([value, label]) => ({ value, label }))

export const permissionLabel = (value: string): string =>
  permissionOptions.find((item) => item.value === value)?.label || value
