// 水平标尺：刻度与左缩进、右缩进、首行缩进三个标记。
// 本轮为视觉呈现，标记不响应拖拽。
import React from 'react'

const 刻度位置 = Array.from({ length: 21 }, (_, 序号) => 序号 * 40)

const Ruler = () => {
  const 标记位置 = [
    { key: 'left', className: 'wps-ruler__marker wps-ruler__marker--left', left: '40px' },
    { key: 'right', className: 'wps-ruler__marker wps-ruler__marker--right', left: '754px' },
    { key: 'first', className: 'wps-ruler__marker wps-ruler__marker--first', left: '40px' },
  ]

  return React.createElement(
    'div',
    { className: 'wps-ruler' },
    React.createElement(
      'div',
      { className: 'wps-ruler__scale' },
      刻度位置.map((位置) =>
        React.createElement('span', {
          key: 位置,
          className: 'wps-ruler__tick',
          style: { left: `${位置}px` },
        })
      )
    ),
    标记位置.map((标记) =>
      React.createElement('span', {
        key: 标记.key,
        className: 标记.className,
        style: { left: 标记.left },
      })
    )
  )
}

export default Ruler
