import { describe, expect, it } from 'vitest'
import { buildDynamicRoutes } from './dynamic'

describe('动态菜单页面解析', () => {
  it('使用菜单对应页面，而不是开发中占位页', async () => {
    const routes = buildDynamicRoutes([{ id: 1, type: 'menu', path: '/error/403', name: '概览', title: '概览', component: 'error/403', children: [] }] as never)
    const component = routes.children?.[0].component as () => Promise<unknown>
    const actual = await component()
    const expected = await import('../pages/error/403.vue')
    expect(actual).toBe(expected)
  }, 20000)
})
