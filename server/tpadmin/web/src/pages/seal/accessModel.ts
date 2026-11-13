export const permissions = [
  ['overview:read','查看运行概览'],['users:read','查看用户管理'],['template:read','查看演示模板'],['template:review','审核演示模板'],
  ['knowledge:read','查看知识内容'],['knowledge:review','审核知识内容'],['skin:read','查看皮肤'],['skin:review','审核皮肤'],
  ['audit:read','查看操作记录'],['converter:read','查看文档转换'],['converter:write','管理文档转换'],
  ['releases:read','查看版本管理'],['releases:write','发布和管理版本'],
  ['admins:read','查看管理员'],['admins:write','管理管理员'],['roles:read','查看角色'],['roles:write','管理角色'],['menus:read','查看菜单'],['menus:write','编辑菜单'],
].map(([value,label]) => ({value:value!,label:label!}));
export const canEditAdmin = (item: {builtin?: boolean}): boolean => item.builtin !== true;
export function adminPayload(form: {username:string;password:string;enabled:boolean;roleIds:string[]}, editing: boolean) {
  if (!editing && !form.username.trim()) throw new Error('请输入管理员账号');
  if (!editing && !form.password) throw new Error('请输入管理员密码');
  return { ...(!editing ? {username:form.username.trim()} : {}), ...(form.password ? {password:form.password} : {}), enabled:form.enabled, roleIds:[...form.roleIds] };
}
export function rolePayload(name: string, values: string[]) {
  if (!name.trim()) throw new Error('请输入角色名称');
  if (values.some(value => !permissions.some(p => p.value === value))) throw new Error('存在无效权限');
  return {name:name.trim(),permissions:[...new Set(values)]};
}
export function menuPayload(form: {title:string;visible:boolean;enabled:boolean;sort:number}) {
  if (!form.title.trim()) throw new Error('请输入菜单名称');
  if (!Number.isSafeInteger(form.sort) || form.sort < 0) throw new Error('菜单排序必须为非负整数');
  return {title:form.title.trim(),visible:form.visible,enabled:form.enabled,sort:form.sort};
}
