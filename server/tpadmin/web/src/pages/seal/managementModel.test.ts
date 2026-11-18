import { describe, expect, it } from 'vitest';
import { filterPublications, maskPhone, mergeReview, sortUsers, auditDetail, hasUploadedAsset, requiredOverviewSection } from './managementModel';

describe('管理工作台业务筛选', () => {
  it('手机号在送入表格前脱敏', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
  });
  it('类型、状态和搜索条件共同筛选公开资料', () => {
    const rows = [
      { kind: 'template', status: 'pending', title: '会议模板', category: '演示' },
      { kind: 'template', status: 'approved', title: '会议模板', category: '演示' },
      { kind: 'knowledge', status: 'pending', title: '会议资料', category: '知识' },
    ];
    expect(filterPublications(rows, 'template', 'pending', '会议')).toEqual([rows[0]]);
  });
  it('详情接口不返回状态时，保留列表里的真实状态', () => {
    expect(mergeReview({ id: 'one', status: 'withdrawn' }, { id: 'one', title: '资料' })).toEqual({ id: 'one', title: '资料', status: 'withdrawn' });
  });
  it('账号默认按最后操作时间倒序，且不改变原列表', () => {
    const source = [{ id: 'a', lastAction: 1 }, { id: 'b', lastAction: 3 }];
    expect(sortUsers(source).map(u => u.id)).toEqual(['b', 'a']);
    expect(source[0]?.id).toBe('a');
  });
  it('上传附件后禁止修改版本号', () => {
    expect(hasUploadedAsset([{ asset: null }, { asset: { id: '已上传' } }])).toBe(true);
    expect(hasUploadedAsset([{ asset: null }])).toBe(false);
  });
  it('发布操作记录显示中文语义', () => {
    expect(auditDetail({ action: 'release-create', detail: '{"platform":"android","version":"2.7.2","channel":"stable"}' })).toContain('2.7.2');
    expect(auditDetail({ action: 'release-create', detail: '{"platform":"android","version":"2.7.2","channel":"stable"}' })).toContain('稳定版');
  });
  it('服务端未授权返回的字段不能被当作空列表', () => {
    expect(() => requiredOverviewSection({publications:[]},'users')).toThrow('无权查看用户管理');
    expect(requiredOverviewSection({users:[]},'users')).toEqual([]);
    expect(() => requiredOverviewSection({},'overview')).toThrow('无权查看运行概览');
  });
});
