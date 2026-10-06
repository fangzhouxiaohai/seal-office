// 写入契约回归：写入pptx 必须同时支持富格式契约（幻灯片[].文本框）与演示文稿模型（幻灯片列表[].文本框列表）。
// 曾经只认「文本框」，导致把应用模型直接交给写入器时**静默丢光所有文本**（并且不报错），
// 批量工具与任何按模型写回的调用都会踩到。
const { 读取pptx, 写入pptx } = require('./pptxCodec')

const 富契约 = {
  页面尺寸: { 宽: 960, 高: 540 },
  幻灯片: [
    { 背景色: '#FFFFFF', 文本框: [{ x: 80, y: 60, width: 800, height: 120, text: '富契约标题', 字号: 40, 加粗: true }] },
  ],
}

const 模型契约 = {
  页面尺寸: { 宽: 960, 高: 540 },
  幻灯片列表: [
    {
      id: '页一',
      title: '模型标题',
      版式: '标题幻灯片',
      背景色: '#FFFFFF',
      文本框列表: [{ id: '框一', x: 80, y: 60, width: 800, height: 120, text: '模型契约标题', 字号: 40, 加粗: true }],
      对象列表: [],
    },
  ],
}

const 取文本 = (读回) => 读回.演示文稿.幻灯片列表.flatMap((页) => (页.文本框列表 ?? []).map((框) => 框.text))

it('富格式契约（幻灯片[].文本框）写入后文本可读回', async () => {
  const 读回 = await 读取pptx(await 写入pptx(富契约))
  expect(取文本(读回)).toEqual(['富契约标题'])
  expect(读回.警告).toEqual([])
})

it('演示文稿模型（幻灯片列表[].文本框列表）写入后文本不丢失', async () => {
  const 读回 = await 读取pptx(await 写入pptx(模型契约))
  expect(取文本(读回)).toEqual(['模型契约标题'])
  expect(读回.警告).toEqual([])
})

it('两种契约写出的文本数量一致，文本框不因契约不同而减少', async () => {
  const 富读回 = await 读取pptx(await 写入pptx(富契约))
  const 模型读回 = await 读取pptx(await 写入pptx(模型契约))
  expect(取文本(富读回).length).toBe(1)
  expect(取文本(模型读回).length).toBe(1)
  expect(取文本(富读回)[0].replace('富契约', '')).toBe(取文本(模型读回)[0].replace('模型契约', ''))
})
