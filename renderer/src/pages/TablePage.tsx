import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const TablePage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '表格',
    onBack: () => setModule('home'),
  })
}

export default TablePage
