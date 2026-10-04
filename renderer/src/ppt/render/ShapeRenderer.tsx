import type { 演示对象 } from '../deck'
export function ShapeRenderer({ 对象 }: { 对象: 演示对象 }) {
  const 形 = 对象.形状
  if (!形) throw new Error('图形缺少几何数据')
  const 样式 = { fill: 形.填充, stroke: 形.线条, strokeWidth: 形.线宽, vectorEffect: 'non-scaling-stroke' as const }
  const 几何 = 形.种类 === '椭圆' ? <ellipse cx="50" cy="50" rx="49" ry="49" {...样式} />
    : 形.种类 === '菱形' ? <polygon points="50,1 99,50 50,99 1,50" {...样式} />
    : 形.种类 === '三角形' ? <polygon points="50,1 99,99 1,99" {...样式} />
    : 形.种类 === '箭头' ? <polygon points="1,25 65,25 65,1 99,50 65,99 65,75 1,75" {...样式} />
    : 形.种类 === '星形' ? <polygon points="50,1 61,36 99,36 69,58 80,96 50,73 20,96 31,58 1,36 39,36" {...样式} />
    : 形.种类 === '爱心' ? <path d="M50 96 C-30 40 3 -20 50 20 C97 -20 130 40 50 96Z" {...样式} />
    : 形.种类 === '艺术字' ? null : <rect x="1" y="1" width="98" height="98" rx={形.种类 === '圆角矩形' ? 12 : 0} {...样式} />
  if (对象.连接) {
    const 线 = 对象.连接, x1 = 线.起点位置.x - 对象.x, y1 = 线.起点位置.y - 对象.y, x2 = 线.终点位置.x - 对象.x, y2 = 线.终点位置.y - 对象.y
    const 角 = Math.atan2(y2-y1,x2-x1), 长 = 10
    return <svg width="100%" height="100%" style={{ overflow: 'visible' }}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={形.线条} strokeWidth={形.线宽}/><path d={`M${x2-长*Math.cos(角-.4)} ${y2-长*Math.sin(角-.4)} L${x2} ${y2} L${x2-长*Math.cos(角+.4)} ${y2-长*Math.sin(角+.4)}`} fill="none" stroke={形.线条} strokeWidth={形.线宽}/></svg>
  }
  return <><svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={形.种类}>{几何}</svg><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, overflow: 'hidden', boxSizing: 'border-box', color: 形.颜色, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 形.字号, fontWeight: 形.加粗 ? 600 : 400, textAlign: 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.3, ...(形.种类 === '艺术字' ? { WebkitTextStroke: `1px ${形.线条}` } : {}) }}>{形.文本}</div></>
}
