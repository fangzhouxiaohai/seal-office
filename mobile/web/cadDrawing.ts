import DxfParser, { type IArcEntity, type ICircleEntity, type ILineEntity, type ILwpolylineEntity, type IPolylineEntity, type IPoint } from 'dxf-parser'
import { PDFDocument, PageSizes, rgb } from 'pdf-lib'

type Point = [number, number]
export type CadEntity =
  | { kind: 'line'; layer: string; points: Point[] }
  | { kind: 'polyline'; layer: string; points: Point[]; closed: boolean }
  | { kind: 'circle'; layer: string; center: Point; radius: number }
  | { kind: 'arc'; layer: string; center: Point; radius: number; start: number; end: number }

function number(value: number): number {
  if (!Number.isFinite(value)) throw new Error('图元的坐标或数值无效')
  return value
}
function point(value: IPoint): Point {
  if (!value) throw new Error('图元缺少坐标')
  if (value.z) throw new Error('仅支持二维图纸')
  return [number(value.x), number(value.y)]
}

export function readDxf(text: string): CadEntity[] {
  // dxf-parser skips unknown entity records. Reject them before copying the editable drawing.
  const lines = text.trim().split(/\r\n?|\n/)
  if (lines.length % 2 || lines.length > 1000000) throw new Error('DXF 格式无效或图纸过大')
  let section = '', nextSection = false, count = 0
  for (let i = 0; i < lines.length; i += 2) {
    const group = lines[i].trim(), value = lines[i+1].trim()
    if (nextSection && group === '2') { section = value; nextSection = false }
    if (group !== '0') continue
    if (value === 'ENDSEC') section = ''
    if (value === 'SECTION') nextSection = true
    if (section === 'ENTITIES' && !['VERTEX', 'SEQEND'].includes(value)) {
      if (!['LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC'].includes(value)) throw new Error('暂不支持图元 '+value)
      count++
    }
  }
  let drawing
  try { drawing = new DxfParser().parseSync(text) }
  catch { throw new Error('DXF 坐标或文件结构无效') }
  if (!count || drawing?.entities?.length !== count) throw new Error('缺少可完整读取的二维图元')
  return drawing.entities.map(entity => {
    const layer = entity.layer || '0'
    if (entity.type === 'LINE') {
      const points = (entity as ILineEntity).vertices.map(point)
      if (points.length !== 2) throw new Error('直线缺少端点坐标')
      return { kind: 'line', layer, points }
    }
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const poly = entity as ILwpolylineEntity | IPolylineEntity
      if (poly.vertices.some(p => p.bulge) || ('includesSplineFitVertices' in poly && (poly.includesSplineFitVertices || poly.includesCurveFitVertices))) throw new Error('暂不支持带弧段或凸度的多段线')
      if (poly.vertices.length < 2) throw new Error('多段线缺少顶点')
      return { kind: 'polyline', layer, points: poly.vertices.map(point), closed: Boolean(poly.shape) }
    }
    const circle = entity as ICircleEntity
    const center = point(circle.center), radius = number(circle.radius)
    if (radius <= 0) throw new Error('半径必须大于零')
    if (entity.type === 'CIRCLE') return { kind: 'circle', layer, center, radius }
    const arc = entity as IArcEntity
    const degrees = (radians: number) => Number((number(radians) * 180 / Math.PI).toFixed(10))
    return { kind: 'arc', layer, center, radius, start: degrees(arc.startAngle), end: degrees(arc.endAngle) }
  })
}

export function writeDxf(entities: CadEntity[]): string {
  const pairs: (string|number)[] = [0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1021',0,'ENDSEC',0,'SECTION',2,'ENTITIES']
  for (const entity of entities) {
    pairs.push(0, entity.kind === 'polyline' ? 'LWPOLYLINE' : entity.kind.toUpperCase(), 8, entity.layer)
    if (entity.kind === 'line' || entity.kind === 'polyline') {
      if (entity.kind === 'polyline') pairs.push(90,entity.points.length,70,entity.closed ? 1 : 0)
      entity.points.forEach(([x,y], i) => {
        const n = entity.kind === 'line' ? i : 0
        pairs.push(10+n,number(x),20+n,number(y))
      })
    } else {
      pairs.push(10,number(entity.center[0]),20,number(entity.center[1]),40,number(entity.radius))
      if (entity.kind === 'arc') pairs.push(50,number(entity.start),51,number(entity.end))
    }
  }
  return pairs.concat(0,'ENDSEC',0,'EOF','').join('\r\n')
}

// SVG uses downward y; both the preview and the vector PDF use the same geometry.
export function cadPath(e: CadEntity): string {
  if (e.kind === 'line' || e.kind === 'polyline') {
    return e.points.map(([x,y],i) => (i ? 'L' : 'M') + x + ' ' + -y).join(' ') + (e.kind === 'polyline' && e.closed ? ' Z' : '')
  }
  const [x,y] = e.center, r = e.radius
  const arc = ' A '+r+' '+r+' 0 '
  if (e.kind === 'circle') return 'M '+(x+r)+' '+(-y)+arc+'0 0 '+(x-r)+' '+(-y)+arc+'0 0 '+(x+r)+' '+(-y)+' Z'
  const end = (a: number) => [x+r*Math.cos(a*Math.PI/180), -y-r*Math.sin(a*Math.PI/180)].join(' ')
  return 'M '+end(e.start)+arc+(((e.end-e.start)%360+360)%360 > 180 ? 1 : 0)+' 0 '+end(e.end)
}

export function drawingBounds(entities: CadEntity[]) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const e of entities) {
    const points = 'points' in e ? e.points : [[e.center[0]-e.radius,e.center[1]-e.radius],[e.center[0]+e.radius,e.center[1]+e.radius]]
    for (const [x,y] of points) { left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,-y); bottom=Math.max(bottom,-y) }
  }
  if (!Number.isFinite(left)) throw new Error('请先导入图纸')
  return {left,top,width:Math.max(right-left,1),height:Math.max(bottom-top,1)}
}

export async function drawingPdf(entities: CadEntity[]) {
  const doc = await PDFDocument.create(), page = doc.addPage(PageSizes.A4)
  const bounds = drawingBounds(entities), scale = Math.min((page.getWidth()-48)/bounds.width,(page.getHeight()-48)/bounds.height)
  const x = (page.getWidth()-bounds.width*scale)/2 - bounds.left*scale
  const y = (page.getHeight()+bounds.height*scale)/2 + bounds.top*scale
  for (const e of entities) page.drawSvgPath(cadPath(e), {x,y,scale,borderWidth:0.8/scale,borderColor:rgb(0.1,0.1,0.1)})
  return doc.save()
}
