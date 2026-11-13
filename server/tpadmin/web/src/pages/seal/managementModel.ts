export const maskPhone = (value: unknown): string => String(value ?? '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
export function requiredOverviewSection(data: Record<string, unknown>, section: string): unknown {
  const field = section === 'overview' ? 'overviewCounts' : section === 'users' ? 'users' : section === 'audit' ? 'audit' : 'publications';
  const label: Record<string,string> = { overview: '运行概览', users: '用户管理', audit: '操作记录', publications: '公开内容' };
  if (!(field in data)) throw new Error(`无权查看${label[field === 'overviewCounts' ? 'overview' : field]}`);
  const value = data[field];
  if (field === 'overviewCounts' ? !value || typeof value !== 'object' || !['users','used','pending'].every(key => Number.isFinite((value as Record<string,unknown>)[key])) : !Array.isArray(value)) throw new Error('管理服务返回的数据不完整');
  return value;
}
export function mergeReview<T extends { id: string; status: string }, U extends { id: string }>(item: T, detail: U): T & U {
  if (item.id !== detail.id) throw new Error('资料详情与所选记录不一致');
  return { ...item, ...detail, status: item.status };
}
export function sortUsers<T extends { lastAction?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (Number(b.lastAction) || 0) - (Number(a.lastAction) || 0));
}
export const hasUploadedAsset = (rows: { asset: unknown }[]): boolean => rows.some(row => Boolean(row.asset));
export function auditDetail(row: { action: string; detail?: unknown }): string {
  const raw = String(row.detail || '').trim();
  if (!raw) return '—';
  const short = (id: string) => id.slice(0, 8);
  try {
    if (row.action === 'review') { const [id, state] = raw.split(':'); const labels: Record<string, string> = { pending: '待审核', approved: '已公开', rejected: '已拒绝', withdrawn: '已撤回' }; return `公开内容 #${short(id || '')} · ${labels[state || ''] || state || '已处理'}`; }
    if (row.action === 'review-download') return `下载公开原文件 #${short(raw)}`;
    if (row.action === 'publish-request') return `公开内容 #${short(raw)}`;
    if (row.action === 'public-report') { const [id, ...rest] = raw.split(':'); return `公开内容 #${short(id || '')} · ${rest.join(':') || '未填写理由'}`; }
    if (row.action === 'converter-config') { const v = JSON.parse(raw); return `${v.enabled ? '启用' : '暂停'} · 并发 ${v.concurrency}`; }
    if (row.action === 'converter-token-reset') return `令牌指纹 ${raw}`;
    if (row.action === 'converter-test') return raw === 'passed' ? '检查通过' : '检查未通过';
    if (row.action.startsWith('release-')) { const v = JSON.parse(raw); return [v.platform, v.version, v.channel === 'beta' ? '测试版' : '稳定版', v.mandatory ? '强制' : '', v.withdrawn ? '已下架' : ''].filter(Boolean).join(' · '); }
  } catch { return raw; }
  return raw;
}
export function filterPublications<T extends { kind: string; status: string; title: string; category?: string; description?: string }>(rows: T[], kind: string, status: string, search: string): T[] {
  const query = search.trim().toLowerCase();
  return rows.filter(row => row.kind === kind && (status === 'all' || row.status === status) && [row.title, row.category, row.description].join(' ').toLowerCase().includes(query));
}
