// 操作记录的文案翻译，行为与现役后台 managementModel 保持一致
export const actionLabels: Record<string, string> = {
  login: '登录云空间',
  'enable-space': '开通云空间',
  'purge-space': '清空并停用云空间',
  'publish-request': '提交公开申请',
  'public-report': '举报公开内容',
  review: '审核公开内容',
  'review-download': '下载公开原文件',
  'converter-config': '修改转换配置',
  'converter-token-reset': '重置转换令牌',
  'converter-test': '转换测试',
  'release-create': '发布新版本',
  'release-update': '修改发布',
  'release-delete': '删除发布',
  'release-asset-upload': '上传安装包'
}

const reviewStates: Record<string, string> = {
  pending: '待审核',
  approved: '已公开',
  rejected: '已拒绝',
  withdrawn: '已撤回'
}

const short = (id: string) => id.slice(0, 8)

export function auditDetail(row: { action: string; detail?: unknown }): string {
  const raw = String(row.detail || '').trim()
  if (!raw) return '—'
  try {
    if (row.action === 'review') {
      const [id, state] = raw.split(':')
      return `公开内容 #${short(id || '')} · ${reviewStates[state || ''] || state || '已处理'}`
    }
    if (row.action === 'review-download') return `下载公开原文件 #${short(raw)}`
    if (row.action === 'publish-request') return `公开内容 #${short(raw)}`
    if (row.action === 'public-report') {
      const [id, ...rest] = raw.split(':')
      return `公开内容 #${short(id || '')} · ${rest.join(':') || '未填写理由'}`
    }
    if (row.action === 'converter-config') {
      const v = JSON.parse(raw)
      return `${v.enabled ? '启用' : '暂停'} · 并发 ${v.concurrency}`
    }
    if (row.action === 'converter-token-reset') return `令牌指纹 ${raw}`
    if (row.action === 'converter-test') return raw === 'passed' ? '检查通过' : '检查未通过'
    if (row.action.startsWith('release-')) {
      const v = JSON.parse(raw)
      return [v.platform, v.version, v.channel === 'beta' ? '测试版' : '稳定版', v.mandatory ? '强制' : '', v.withdrawn ? '已下架' : '']
        .filter(Boolean)
        .join(' · ')
    }
  } catch {
    return raw
  }
  return raw
}
