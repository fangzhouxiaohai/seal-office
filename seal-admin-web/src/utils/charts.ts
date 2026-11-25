// 图表统一配置：按需注册 ECharts 模块，颜色按固定分类顺序取用（已通过色觉辨识校验）
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])

// 分类色固定顺序：蓝、橙、青、黄、品红、绿、紫、红；颜色跟随实体，不随排名变化
export const SERIES = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647']
// 状态色只表达成功/失败，配合文字标签使用
export const STATUS = { good: '#0aac23', critical: '#dc3c3d' }

const INK = { primary: '#1f2d3d', secondary: '#5a6b80', muted: '#8c9bab', grid: '#eef1f6', axis: '#dfe4ec' }

const tooltip = {
  backgroundColor: '#ffffff',
  borderColor: '#e8edf5',
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: INK.primary, fontSize: 12 },
  extraCssText: 'box-shadow:0 4px 16px rgba(16,24,40,.08);border-radius:8px;'
}

const categoryAxis = (data: string[], extra: Record<string, unknown> = {}) => ({
  type: 'category',
  data,
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  axisLabel: { color: INK.muted, fontSize: 11 },
  ...extra
})

const valueAxis = (formatter?: (value: number) => string) => ({
  type: 'value',
  minInterval: 1,
  splitLine: { lineStyle: { color: INK.grid } },
  axisLabel: { color: INK.muted, fontSize: 11, formatter }
})

const legend = { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: INK.secondary } }

export interface LineSeries {
  name: string
  data: number[]
  color: string
  area?: boolean
}

/** 折线图：多条同量纲序列共用一根纵轴，悬停出十字准线提示 */
export function lineOption(days: string[], series: LineSeries[], formatter?: (value: number) => string) {
  return {
    color: series.map((item) => item.color),
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, valueFormatter: formatter },
    legend: series.length > 1 ? legend : undefined,
    grid: { left: 8, right: 16, top: series.length > 1 ? 36 : 16, bottom: 4, containLabel: true },
    xAxis: categoryAxis(days, { boundaryGap: false }),
    yAxis: valueAxis(formatter),
    series: series.map((item) => ({
      name: item.name,
      type: 'line',
      data: item.data,
      smooth: 0.3,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
      areaStyle: item.area
        ? {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: item.color + '33' }, { offset: 1, color: item.color + '00' }]
            }
          }
        : undefined
    }))
  }
}

export interface BarSeries {
  name: string
  data: number[]
  color: string
}

/** 柱状图：圆角朝外、贴合基线；horizontal 时用于排行 */
export function barOption(
  labels: string[],
  series: BarSeries[],
  {
    horizontal = false,
    stack = false,
    formatter,
    labelWidth = 96
  }: { horizontal?: boolean; stack?: boolean; formatter?: (v: number) => string; labelWidth?: number } = {}
) {
  const radius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  const category = categoryAxis(labels, horizontal ? { inverse: true, axisLabel: { color: INK.secondary, fontSize: 12, width: labelWidth, overflow: 'truncate' } } : {})
  const value = valueAxis(formatter)
  return {
    color: series.map((item) => item.color),
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(106,92,245,.06)' } }, valueFormatter: formatter },
    legend: series.length > 1 ? legend : undefined,
    grid: { left: 8, right: horizontal ? 48 : 16, top: series.length > 1 ? 36 : 16, bottom: 4, containLabel: true },
    xAxis: horizontal ? value : category,
    yAxis: horizontal ? category : value,
    series: series.map((item, index) => ({
      name: item.name,
      type: 'bar',
      data: item.data,
      stack: stack ? 'total' : undefined,
      barMaxWidth: horizontal ? 14 : 18,
      barGap: '20%',
      itemStyle: {
        // 堆叠时只给顶层圆角，层间留 2px 表面色缝隙
        borderRadius: stack && index < series.length - 1 ? 0 : radius,
        borderColor: '#ffffff',
        borderWidth: stack ? 1 : 0
      },
      label: horizontal
        ? { show: true, position: 'right', color: INK.secondary, fontSize: 11, formatter: (p: any) => (formatter ? formatter(p.value) : p.value) }
        : undefined
    }))
  }
}

export interface PieItem {
  name: string
  value: number
}

/** 环形图：扇区之间 2px 表面色缝隙，直接标注名称与占比 */
export function pieOption(items: PieItem[], colors: string[] = SERIES, formatter?: (v: number) => string) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return {
    color: colors,
    tooltip: {
      ...tooltip,
      trigger: 'item',
      formatter: (p: any) => `${p.marker}${p.name}<br/><b>${formatter ? formatter(p.value) : p.value}</b> · ${p.percent}%`
    },
    // 图例单行滚动，避免多分类时折行压到扇区标注
    legend: { ...legend, type: 'scroll', top: 'auto', bottom: 0, right: 'center', left: 'center', pageIconSize: 10 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '60%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 4 },
        label: { color: INK.secondary, fontSize: 11, formatter: '{b}\n{d}%' },
        labelLine: { length: 8, length2: 8, lineStyle: { color: INK.axis } },
        data: total === 0 ? [] : items.filter((item) => item.value > 0)
      }
    ]
  }
}

/** 字节数按 1024 进位换算成可读容量 */
export function bytes(value: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const amount = value / Math.pow(1024, index)
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

export function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days} 天 ${hours} 小时`
  if (hours) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分钟`
}
