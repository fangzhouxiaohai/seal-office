import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const WordPage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '文档',
    onBack: () => setModule('home'),
  })
}

export default WordPage
