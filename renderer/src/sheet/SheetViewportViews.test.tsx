import { App as AntdApp } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AppProvider, useAppStore } from '../store'
import { 创建工作表, type Sheet } from './model'
import SheetEditor from './SheetEditor'

it('打开和切换工作表采用来源视图，调整缩放与网格线保存到各表', () => {
  let 状态: ReturnType<typeof useAppStore> | undefined
  const 首表: Sheet = { ...创建工作表('来源七成', 2, 2), 视图: { 缩放: 70, 普通缩放: 70, 显示网格线: false } }
  const 次表: Sheet = { ...创建工作表('来源原大', 2, 2), 视图: { 缩放: 100, 显示网格线: true } }
  function 容器() {
    状态 = useAppStore()
    return <><button onClick={() => 状态!.createDoc('table', [首表, 次表])}>打开来源视图</button>{状态.module === 'table' ? <SheetEditor /> : null}</>
  }
  const { container } = render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开来源视图'))
  expect(screen.getByRole('button', { name: '恢复百分之百' })).toHaveTextContent('70%')
  expect(container.querySelector('.wps-sheet-stage')).toHaveClass('wps-sheet-stage--no-gridlines')
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(状态!.表格文档模型[状态!.activeDocumentId!][0].视图?.缩放).toBe(75)
  fireEvent.click(screen.getByText('来源原大'))
  expect(screen.getByRole('button', { name: '恢复百分之百' })).toHaveTextContent('100%')
  expect(container.querySelector('.wps-sheet-stage')).not.toHaveClass('wps-sheet-stage--no-gridlines')
  fireEvent.click(screen.getByText('来源七成'))
  expect(screen.getByRole('button', { name: '恢复百分之百' })).toHaveTextContent('75%')
  fireEvent.click(screen.getByRole('tab', { name: '视图' }))
  fireEvent.click(screen.getByRole('button', { name: '网格线' }))
  expect(状态!.表格文档模型[状态!.activeDocumentId!][0].视图?.显示网格线).toBe(true)
})
