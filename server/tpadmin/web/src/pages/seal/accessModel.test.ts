import { describe, expect, it } from 'vitest';
import { adminPayload, rolePayload, menuPayload, permissions, canEditAdmin } from './accessModel';

describe('管理权限表单', () => {
  it('编辑管理员未填写密码时不提交密码', () => {
    expect(adminPayload({ username:'operator', password:'', enabled:true, roleIds:['r'] }, true)).toEqual({ enabled:true, roleIds:['r'] });
  });
  it('新增管理员必须填写账号和密码', () => {
    expect(() => adminPayload({ username:'operator', password:'', enabled:true, roleIds:[] }, false)).toThrow('请输入管理员密码');
  });
  it('角色权限必须是已定义权限，不提交未知授权', () => {
    expect(() => rolePayload('运营人员',['unknown:write'])).toThrow('存在无效权限');
    expect(rolePayload('运营人员',[permissions[0]!.value])).toEqual({name:'运营人员',permissions:[permissions[0]!.value]});
  });
  it('菜单仅提交标题、显示状态和排序', () => {
    expect(menuPayload({ title:'用户管理',visible:true,enabled:false,sort:10 })).toEqual({ title:'用户管理',visible:true,enabled:false,sort:10 });
    expect(() => menuPayload({title:'',visible:true,enabled:true,sort:0})).toThrow('请输入菜单名称');
  });
  it('内置超管不可编辑或删除', () => {
    expect(canEditAdmin({builtin:true})).toBe(false);
    expect(canEditAdmin({builtin:false})).toBe(true);
  });
});
