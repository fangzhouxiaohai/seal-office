import test from 'node:test'
import assert from 'node:assert/strict'
import { 转为旧版说明 } from './release-notes-plain.mjs'

test('旧版客户端收到可读纯文字，保留标题、列表内容和正常标点', () => {
  const source = '# 海豹办公 2.7.2\n\n## 编辑与查看\n\n- **重要**：支持 C#、3.14 和标点！\n- 文件 `seal-office.apk`；[详情](https://example.org)。'
  const output = 转为旧版说明(source)
  assert.match(output, /^海豹办公 2\.7\.2/m)
  assert.match(output, /^编辑与查看/m)
  assert.match(output, /重要：支持 C#、3\.14 和标点！/)
  assert.match(output, /文件 seal-office\.apk；详情。/)
  assert.doesNotMatch(output, /^\s*(?:#|- |\*)/m)
})

test('纯文本内容和换行保留，危险 HTML 不作为说明展示', () => {
  assert.equal(转为旧版说明('第一行。\n第二行！'), '第一行。\n第二行！')
  assert.equal(转为旧版说明('正常内容\n\n<script>alert(1)</script>'), '正常内容')
})
