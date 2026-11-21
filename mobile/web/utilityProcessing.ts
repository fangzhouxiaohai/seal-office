import type { 像素图 } from '../../renderer/src/scan/imageProcessing'

export function 证件像素(规格:'一寸'|'二寸'): [number, number] {
  return 规格 === '一寸' ? [295, 413] : [413, 579]
}

export function 整理视频尺寸(宽:number, 高:number, 上限:number): [number, number] {
  if (宽 <= 0 || 高 <= 0 || 上限 < 2) throw new Error('无法读取视频的有效尺寸。')
  const 比例 = Math.min(1, 上限 / Math.max(宽,高))
  return [Math.max(2,Math.floor(宽*比例/2)*2), Math.max(2,Math.floor(高*比例/2)*2)]
}

/** 只去掉与边界连通并接近底色的像素，保留前景中的同色部分。 */
export function 移除边缘背景(图:像素图, 容差:number, 取样?:[number,number]):像素图 {
  const {宽, 高, 数据:原} = 图
  const 数据 = new Uint8ClampedArray(原)
  const 角 = [0, 宽-1, (高-1)*宽, 宽*高-1]
  const 色差 = (点:number, 对照:number) => Math.max(...[0,1,2].map(通道 => Math.abs(原[点*4+通道]-原[对照*4+通道])))
  const 位置 = 取样 ? Math.min(高-1, Math.max(0, Math.round(取样[1]*(高-1)))) * 宽 + Math.min(宽-1,Math.max(0,Math.round(取样[0]*(宽-1))))
    : [...角].sort((a,b) => 角.reduce((和, c) => 和 + 色差(a,c)-色差(b,c),0))[0]
  const 已访问 = new Uint8Array(宽 * 高), 队列 = new Int32Array(宽 * 高)
  let 读 = 0, 写 = 0
  const 加入 = (点:number) => {
    if (已访问[点]) return
    已访问[点] = 1
    if (原[点*4+3] !== 0 && 色差(点,位置) > 容差) return
    队列[写++] = 点; 数据[点*4+3] = 0
  }
  for (let x=0; x<宽; x++) { 加入(x); 加入((高-1)*宽+x) }
  for (let y=1; y<高-1; y++) { 加入(y*宽); 加入(y*宽+宽-1) }
  while (读<写) {
    const 点=队列[读++], x=点%宽
    if (x>0) 加入(点-1)
    if (x<宽-1) 加入(点+1)
    if (点>=宽) 加入(点-宽)
    if (点<(高-1)*宽) 加入(点+宽)
  }
  if (!写) throw new Error('未找到相连的背景，请点选照片边缘的底色或提高容差。')
  return {...图, 数据}
}

/** 用积分图估计每个像素邻近的纸面亮度，再校正光照，保持笔画对比。 */
export function 校正纸面阴影(图:像素图):像素图 {
  const {宽, 高, 数据:原}=图, 步长=宽+1
  const 积分=new Float64Array(步长*(高+1)), 数据=new Uint8ClampedArray(原)
  for (let y=0;y<高;y++) {
    let 行和=0
    for(let x=0;x<宽;x++) {
      const i=(y*宽+x)*4
      行和+=(原[i]*.299+原[i+1]*.587+原[i+2]*.114)
      积分[(y+1)*步长+x+1]=积分[y*步长+x+1]+行和
    }
  }
  const 半径=Math.max(4, Math.round(Math.min(宽,高)/23))
  for(let y=0;y<高;y++) for(let x=0;x<宽;x++) {
    const 左=Math.max(0,x-半径),右=Math.min(宽,x+半径+1),上=Math.max(0,y-半径),下=Math.min(高,y+半径+1)
    const 背景=(积分[下*步长+右]-积分[下*步长+左]-积分[上*步长+右]+积分[上*步长+左])/((右-左)*(下-上))
    const i=(y*宽+x)*4, 系数=Math.min(2.1, 246/Math.max(1,背景))
    for(let 通道=0;通道<3;通道++) 数据[i+通道]=原[i+通道]*系数
  }
  return {...图, 数据}
}

/** 重合长度按照正文字符统计，同一段被多个窗口覆盖时只计一次。 */
export function 比对原文(正文:string, 对照:string) {
  const 标准化 = (文:string) => 文.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
  const 目标=Array.from(标准化(正文)), 来源=Array.from(标准化(对照)), 窗口=8
  if (Math.min(目标.length,来源.length)<窗口) throw new Error('正文和对照材料均需至少八个文字或数字。')
  if (Math.max(目标.length,来源.length)>200000) throw new Error('每份材料最多支持二十万个字符，请分章节比对。')
  const 字串=new Set<string>()
  for(let i=0;i<=来源.length-窗口;i++) 字串.add(来源.slice(i,i+窗口).join(''))
  const 区间: [number, number][]=[]
  for(let i=0;i<=目标.length-窗口;i++) {
    if (!字串.has(目标.slice(i,i+窗口).join(''))) continue
    const 前=区间[区间.length-1]
    if (前 && i<前[1]) 前[1]=i+窗口
    else 区间.push([i,i+窗口])
  }
  const 字数=区间.reduce((和,[起,终])=>和+终-起,0)
  return { 比例:Math.round(字数/目标.length*1000)/10, 总字数:目标.length, 重合字数:字数, 匹配:区间.map(([起,终])=>目标.slice(起,终).join('')) }
}
