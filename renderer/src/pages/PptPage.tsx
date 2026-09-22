import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const PptPage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '演示',
    onBack: () => setModule('home'),
  })
}

export default PptPage
