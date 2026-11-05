const { createShareLinkService } = require('./shareLink')

describe('本人分享记录客户端', () => {
  it('从本机解密文件名、按页请求并批量处理，不把文件名送往服务器', async () => {
    const request = vi.fn(async (route, options) => {
      if (route.startsWith('/v1/my-shares?')) return { items: [{ kind: 'link', id: 'link', nodeId: 'node', status: 'active' }], total: 1, page: 2 }
      if (route === '/v1/my-shares/batch') return { results: [{ kind: 'link', id: 'link', ok: true }], hasMore: false }
      throw new Error('未预期请求')
    })
    const list = vi.fn(async () => [{ id: 'node', meta: { name: '机密合同.docx' } }])
    const service = createShareLinkService({ request, list, status: () => ({ url: 'https://cloud.example.test' }) })
    const page = await service.mySharesList({ page: 2, limit: 50, status: 'active' })
    expect(page.items[0].name).toBe('机密合同.docx')
    expect(request).toHaveBeenCalledWith('/v1/my-shares?page=2&limit=50&status=active&kind=all')
    const result = await service.mySharesBatch({ action: 'revoke', entries: [{ kind: 'link', id: 'link' }] })
    expect(result.results[0].ok).toBe(true)
    expect(request).toHaveBeenCalledWith('/v1/my-shares/batch', { method: 'POST', data: { action: 'revoke', entries: [{ kind: 'link', id: 'link' }] } })
    expect(JSON.stringify(request.mock.calls)).not.toContain('机密合同')
    expect(list).toHaveBeenCalledTimes(2)
  })
  it('按本机文件名关联节点标识筛选，清理前查询实时数量', async () => {
    const first = '11111111-1111-4111-8111-111111111111'
    const second = '22222222-2222-4222-8222-222222222222'
    const request = vi.fn(async route => route === '/v1/my-shares/cleanup-preview' ? { count: 3 } : { items: [{ kind: 'account', id: 'share', nodeId: first, status: 'active' }], total: 1 })
    const service = createShareLinkService({ request, list: async () => [{ id: first, meta: { name: '机密合同.docx' } }, { id: second, meta: { name: '普通报表.xlsx' } }], status: () => ({ url: 'https://cloud.example.test' }) })
    const result = await service.mySharesList({ page: 1, kind: 'account', name: '合同' })
    expect(result.items[0].name).toBe('机密合同.docx')
    expect(request).toHaveBeenCalledWith('/v1/my-shares/query', { method: 'POST', data: { page: 1, limit: 50, status: 'all', kind: 'account', nodeIds: [first] } })
    expect(JSON.stringify(request.mock.calls)).not.toContain('机密合同')
    expect(await service.mySharesCleanupPreview()).toEqual({ count: 3 })
  })
})
