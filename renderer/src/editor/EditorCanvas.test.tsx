import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import EditorCanvas from './EditorCanvas'

it('自定义纸张和非对称页边距使用来源文档的原始数值显示', () => {
  const { container } = render(<EditorCanvas
    html="<p>正文</p>"
    paper="自定义"
    orientation="纵向"
    margin="自定义"
    customPaper={{ 宽: 12000, 高: 16000 }}
    customMargin={{ 上: 1900, 右: 1300, 下: 1700, 左: 1400 }}
  />)
  const 纸张 = container.querySelector('.wps-editor-canvas__paper')
  expect(纸张).toHaveStyle({ width: '800px', padding: '126.66666666666667px 86.66666666666667px 113.33333333333333px 93.33333333333333px' })
})
