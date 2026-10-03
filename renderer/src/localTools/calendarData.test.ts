import { describe, expect, it } from 'vitest'
import { 解析日程, 生成日历文件 } from './calendarData'

describe('本机日历数据', () => {
  it('拒绝损坏的数据，不把异常当成空日历', () => {
    expect(() => 解析日程('[{"id":"1","标题":"会议","日期":"2026-02-30"}]')).toThrow('日期')
  })

  it('导出的日历文件包含可识别日期并转义换行', () => {
    const 内容 = 生成日历文件([{ id: 'a', 标题: '项目,评审', 日期: '2026-10-03', 开始: '09:30', 结束: '10:30', 备注: '一行\n二行' }])
    expect(内容).toContain('BEGIN:VCALENDAR')
    expect(内容).toContain('DTSTART:20261003T093000')
    expect(内容).toContain('SUMMARY:项目\\,评审')
    expect(内容).toContain('DESCRIPTION:一行\\n二行')
  })
})
