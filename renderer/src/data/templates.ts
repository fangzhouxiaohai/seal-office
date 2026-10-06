// 模板库数据
import { 创建演示文稿, 创建幻灯片, 创建文本框, type 演示文稿 } from '../ppt/deck'

export interface 模板项 {
  id: string
  名称: string
  分类: 'word' | 'table' | 'ppt'
  描述: string
  内容: string
  标签?: string[]
  演示设置?: { 背景色: string; 标题: string; 副标题: string; 页脚: string; 章节?: Array<{ 标题: string; 要点: string[] }> }
}

export const WORD_TEMPLATES: 模板项[] = [
  {
    id: 'word-resume-001',
    名称: '个人简历',
    分类: 'word',
    描述: '简洁专业的个人简历模板',
    标签: ['简历', '求职'],
    内容: `<div style="text-align:center;padding:40px;border:1px solid #E8EBF0;border-radius:8px">
      <h1 style="color:#2B6CF6">个人简历</h1>
      <p><strong>姓名：</strong>__________  <strong>电话：</strong>__________</p>
      <p><strong>邮箱：</strong>__________  <strong>地址：</strong>__________</p>
      <hr style="margin:20px 0">
      <h2>求职意向</h2>
      <p>__________</p>
      <h2>教育背景</h2>
      <p>__________</p>
      <h2>工作经历</h2>
      <p>__________</p>
      <h2>技能特长</h2>
      <p>__________</p>
    </div>`
  },
  {
    id: 'word-contract-001',
    名称: '劳动合同',
    分类: 'word',
    描述: '标准劳动合同模板',
    标签: ['合同', '法律'],
    内容: `<div style="padding:40px;border:1px solid #E8EBF0;border-radius:8px">
      <h2 style="text-align:center">劳动合同书</h2>
      <p><strong>甲方（用人单位）：</strong>__________</p>
      <p><strong>乙方（劳动者）：</strong>__________</p>
      <p>身份证号码：__________</p>
      <hr style="margin:20px 0">
      <h3>第一条 合同期限</h3>
      <p>本合同期限为____年，自____年__月__日起至____年__月__日止。</p>
      <h3>第二条 工作内容</h3>
      <p>乙方同意根据甲方工作需要，担任__________岗位工作。</p>
      <h3>第三条 劳动报酬</h3>
      <p>甲方每月__日前以货币形式支付乙方工资，月工资为__________元。</p>
      <h3>第四条 劳动保护</h3>
      <p>甲方严格执行劳动定额标准，不得强迫或者变相强迫乙方加班。</p>
    </div>`
  },
  {
    id: 'word-report-001',
    名称: '工作报告',
    分类: 'word',
    描述: '日常工作汇报模板',
    标签: ['报告', '工作'],
    内容: `<div style="padding:40px;border:1px solid #E8EBF0;border-radius:8px">
      <h1 style="text-align:center">工作报告</h1>
      <p><strong>报告人：</strong>__________  <strong>日期：</strong>__________</p>
      <hr style="margin:20px 0">
      <h2>一、工作概述</h2>
      <p>本周/本月主要工作内容：</p>
      <p>1. __________</p>
      <p>2. __________</p>
      <h2>二、完成情况</h2>
      <p>1. __________</p>
      <h2>三、存在问题</h2>
      <p>1. __________</p>
      <h2>四、下一步计划</h2>
      <p>1. __________</p>
    </div>`
  },
  {
    id: 'word-letter-001',
    名称: '公务函件',
    分类: 'word',
    描述: '标准公务函件模板',
    标签: ['函件', '公文'],
    内容: `<div style="padding:40px;border:1px solid #E8EBF0;border-radius:8px">
      <h2 style="text-align:center">关于__________的函</h2>
      <p><strong>__________单位：</strong></p>
      <p>贵单位《关于__________的函》（__________〔____〕__号）收悉。经研究，现回复如下：</p>
      <p>一、__________</p>
      <p>二、__________</p>
      <p>特此函复。</p>
      <p style="text-align:right;margin-top:40px">__________单位</p>
      <p style="text-align:right">____年__月__日</p>
    </div>`
  }
]

export const TABLE_TEMPLATES: 模板项[] = [
  {
    id: 'table-finance-001',
    名称: '财务报表',
    分类: 'table',
    描述: '月度财务报表模板',
    标签: ['财务', '报表'],
    内容: `<table style="border-collapse:collapse;width:100%">
      <tr style="background:#F0F5FF"><th style="border:1px solid #E8EBF0;padding:8px">项目</th><th style="border:1px solid #E8EBF0;padding:8px">收入（元）</th><th style="border:1px solid #E8EBF0;padding:8px">支出（元）</th><th style="border:1px solid #E8EBF0;padding:8px">结余（元）</th></tr>
      <tr><td style="border:1px solid #E8EBF0;padding:8px">营业收入</td><td style="border:1px solid #E8EBF0;padding:8px">()</td><td style="border:1px solid #E8EBF0;padding:8px">-</td><td style="border:1px solid #E8EBF0;padding:8px">()</td></tr>
      <tr><td style="border:1px solid #E8EBF0;padding:8px">成本费用</td><td style="border:1px solid #E8EBF0;padding:8px">-</td><td style="border:1px solid #E8EBF0;padding:8px">()</td><td style="border:1px solid #E8EBF0;padding:8px">(-)</td></tr>
      <tr style="background:#F5F5F5"><td style="border:1px solid #E8EBF0;padding:8px"><strong>合计</strong></td><td style="border:1px solid #E8EBF0;padding:8px"><strong>()</strong></td><td style="border:1px solid #E8EBF0;padding:8px"><strong>()</strong></td><td style="border:1px solid #E8EBF0;padding:8px"><strong>()</strong></td></tr>
    </table>`
  },
  {
    id: 'table-inventory-001',
    名称: '库存管理',
    分类: 'table',
    描述: '库存进出记录模板',
    标签: ['库存', '管理'],
    内容: `<table style="border-collapse:collapse;width:100%">
      <tr style="background:#F0F5FF"><th style="border:1px solid #E8EBF0;padding:8px">物品编号</th><th style="border:1px solid #E8EBF0;padding:8px">物品名称</th><th style="border:1px solid #E8EBF0;padding:8px">数量</th><th style="border:1px solid #E8EBF0;padding:8px">入库日期</th><th style="border:1px solid #E8EBF0;padding:8px">出库日期</th></tr>
      <tr><td style="border:1px solid #E8EBF0;padding:8px">001</td><td style="border:1px solid #E8EBF0;padding:8px">__________</td><td style="border:1px solid #E8EBF0;padding:8px">()</td><td style="border:1px solid #E8EBF0;padding:8px">____-__-__</td><td style="border:1px solid #E8EBF0;padding:8px">-</td></tr>
    </table>`
  },
  {
    id: 'table-schedule-001',
    名称: '日程安排',
    分类: 'table',
    描述: '日常工作日程安排模板',
    标签: ['日程', '计划'],
    内容: `<table style="border-collapse:collapse;width:100%">
      <tr style="background:#F0F5FF"><th style="border:1px solid #E8EBF0;padding:8px">时间</th><th style="border:1px solid #E8EBF0;padding:8px">周一</th><th style="border:1px solid #E8EBF0;padding:8px">周二</th><th style="border:1px solid #E8EBF0;padding:8px">周三</th><th style="border:1px solid #E8EBF0;padding:8px">周四</th><th style="border:1px solid #E8EBF0;padding:8px">周五</th></tr>
      <tr><td style="border:1px solid #E8EBF0;padding:8px">上午</td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td></tr>
      <tr><td style="border:1px solid #E8EBF0;padding:8px">下午</td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td><td style="border:1px solid #E8EBF0;padding:8px"></td></tr>
    </table>`
  }
]

export const PPT_TEMPLATES: 模板项[] = [
  {
    id: 'ppt-business-001',
    名称: '商务演示',
    分类: 'ppt',
    描述: '商务会议演示模板',
    标签: ['商务', '会议'],
    演示设置: { 背景色: '#214FAD', 标题: '商务演示', 副标题: '汇报人：__________', 页脚: '__________年__月__日' },
    内容: `<div style="text-align:center;padding:80px;background:#214FAD;color:white;border-radius:8px">
      <h1 style="font-size:48px;margin:0">商务演示</h1>
      <p style="font-size:24px;margin:20px 0">汇报人：__________</p>
      <p style="font-size:18px;margin:0">__________年__月__日</p>
    </div>`
  },
  {
    id: 'ppt-education-001',
    名称: '教育培训',
    分类: 'ppt',
    描述: '培训课件模板',
    标签: ['教育', '培训'],
    演示设置: { 背景色: '#17694D', 标题: '培训课程', 副标题: '讲师：__________', 页脚: '__________部门' },
    内容: `<div style="text-align:center;padding:80px;background:#17694D;color:white;border-radius:8px">
      <h1 style="font-size:48px;margin:0">培训课程</h1>
      <p style="font-size:24px;margin:20px 0">讲师：__________</p>
      <p style="font-size:18px;margin:0">__________部门</p>
    </div>`
  },
  {
    id: 'ppt-product-001',
    名称: '产品介绍',
    分类: 'ppt',
    描述: '新产品发布演示模板',
    标签: ['产品', '发布'],
    演示设置: { 背景色: '#A44A17', 标题: '产品介绍', 副标题: '__________产品', 页脚: '版本 1.0' },
    内容: `<div style="text-align:center;padding:80px;background:#A44A17;color:white;border-radius:8px">
      <h1 style="font-size:48px;margin:0">产品介绍</h1>
      <p style="font-size:24px;margin:20px 0">__________产品</p>
      <p style="font-size:18px;margin:0">版本 1.0</p>
    </div>`
  }
]

/** 新建后的正文直接写入编辑器，表格保留真实单元格，演示生成可编辑的多页文本框。 */
const 文档模板 = (id: string, 名称: string, 描述: string, 标签: string[], 章节: Array<[string, string[]]>): 模板项 => ({
  id, 名称, 描述, 标签, 分类: 'word',
  内容: `<div style="max-width:760px;margin:auto;font-family:'Microsoft YaHei',sans-serif;line-height:1.8;color:#263145"><h1 style="text-align:center;color:#214FAD">${名称}</h1><p style="text-align:center;color:#697386">填写人：__________　日期：____年__月__日</p><hr>${章节.map(([标题, 条目]) => `<h2 style="color:#214FAD;border-bottom:1px solid #DCE5F4">${标题}</h2>${条目.map((文字) => `<p>${文字}</p>`).join('')}`).join('')}</div>`,
})

WORD_TEMPLATES.push(
  文档模板('word-meeting-001', '会议纪要', '含议题、决定、负责人和待办事项', ['会议', '协作'], [
    ['会议基本信息', ['会议主题：__________　时间：__________　地点：__________', '主持人：__________　记录人：__________　参会人员：__________']],
    ['讨论议题', ['议题一：__________', '讨论要点：__________', '议题二：__________', '讨论要点：__________']],
    ['会议决定', ['决定一：__________', '决定二：__________']],
    ['行动计划', ['事项：__________　负责人：__________　完成时间：__________', '复盘日期：__________']],
  ]),
  文档模板('word-project-001', '项目计划书', '从目标、里程碑到风险的项目规划', ['项目', '计划'], [
    ['项目概况', ['项目名称：__________　项目负责人：__________', '背景与目标：__________', '范围与交付物：__________']],
    ['里程碑', ['阶段一：__________　截止日期：__________', '阶段二：__________　截止日期：__________', '验收标准：__________']],
    ['资源与预算', ['参与人员：__________', '预计预算：__________']],
    ['风险与应对', ['风险：__________　影响：__________　应对措施：__________']],
  ]),
  文档模板('word-proposal-001', '商业提案', '适合客户沟通的方案框架', ['商务', '方案'], [
    ['需求概述', ['客户：__________　项目：__________', '当前挑战：__________']],
    ['方案与价值', ['建议方案：__________', '预期收益：__________', '实施范围：__________']],
    ['实施安排', ['启动时间：__________　预计周期：__________', '关键节点：__________']],
    ['费用与后续', ['费用构成：__________', '下一步沟通事项：__________']],
  ]),
  文档模板('word-weekly-001', '周报', '按成果、问题和下周计划整理', ['工作', '汇报'], [
    ['本周成果', ['1. 已完成：__________', '2. 取得的结果：__________']],
    ['进度与数据', ['重点任务：__________　完成度：____%', '关键指标：__________']],
    ['问题与支持', ['遇到的问题：__________', '需要的支持：__________']],
    ['下周计划', ['优先事项一：__________', '优先事项二：__________']],
  ]),
)

const 表格模板 = (id: string, 名称: string, 描述: string, 标签: string[], 表头: string[], 数据: string[][]): 模板项 => ({
  id, 名称, 描述, 标签, 分类: 'table',
  内容: `<table style="border-collapse:collapse;width:100%"><thead><tr>${表头.map((项) => `<th style="border:1px solid #B8C7E0;padding:8px;background:#EAF1FF">${项}</th>`).join('')}</tr></thead><tbody>${数据.map((行) => `<tr>${行.map((值) => `<td style="border:1px solid #D5DEEB;padding:8px">${值}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
})

TABLE_TEMPLATES.push(
  表格模板('table-budget-001', '项目预算', '分类记录预算、实际支出与差额', ['预算', '项目'], ['费用类别', '预算金额', '实际金额', '差额', '备注'], [
    ['人员费用', '0', '0', '=B2-C2', ''], ['软件及工具', '0', '0', '=B3-C3', ''], ['差旅费用', '0', '0', '=B4-C4', ''], ['其他费用', '0', '0', '=B5-C5', ''], ['合计', '=SUM(B2:B5)', '=SUM(C2:C5)', '=B6-C6', ''],
  ]),
  表格模板('table-sales-001', '销售跟进', '客户线索与下一步跟进记录', ['销售', '客户'], ['客户', '联系人', '需求', '阶段', '预计金额', '下次跟进', '负责人'], [
    ['示例客户 A', '张先生', '产品咨询', '初次接触', '0', '____-__-__', ''], ['示例客户 B', '李女士', '方案报价', '需求确认', '0', '____-__-__', ''], ['','','','','','',''],
  ]),
  表格模板('table-attendance-001', '考勤记录', '按日期记录出勤和工时', ['人事', '考勤'], ['日期', '姓名', '上班时间', '下班时间', '出勤状态', '工时', '备注'], [
    ['____-__-__', '', '09:00', '18:00', '正常', '8', ''], ['____-__-__', '', '09:00', '18:00', '正常', '8', ''], ['','','','','','',''],
  ]),
  表格模板('table-task-001', '任务看板', '用表格管理优先级、负责人和进度', ['项目', '任务'], ['编号', '任务', '负责人', '优先级', '状态', '截止日期', '完成度'], [
    ['T-001', '需求确认', '', '高', '进行中', '____-__-__', '50%'], ['T-002', '方案评审', '', '中', '待开始', '____-__-__', '0%'], ['T-003', '交付验收', '', '高', '待开始', '____-__-__', '0%'],
  ]),
)

PPT_TEMPLATES.push(
  { id: 'ppt-project-001', 名称: '项目汇报', 分类: 'ppt', 描述: '目标、进展、风险与下一步行动', 标签: ['项目', '汇报'], 内容: '<h1>项目汇报</h1><p>目标 · 进度 · 风险 · 下一步</p>', 演示设置: { 背景色: '#284B8F', 标题: '项目汇报', 副标题: '项目名称：__________', 页脚: '汇报人：__________' } },
  { id: 'ppt-quarterly-001', 名称: '季度总结', 分类: 'ppt', 描述: '业绩、亮点与下季度目标', 标签: ['总结', '业务'], 内容: '<h1>季度总结</h1><p>成果 · 复盘 · 规划</p>', 演示设置: { 背景色: '#3B5E62', 标题: '季度总结', 副标题: '____年第__季度', 页脚: '部门：__________' } },
  { id: 'ppt-pitch-001', 名称: '创业路演', 分类: 'ppt', 描述: '痛点、方案、市场与商业模式', 标签: ['路演', '商业'], 内容: '<h1>创业路演</h1><p>让想法被清楚看见</p>', 演示设置: { 背景色: '#533D78', 标题: '创业路演', 副标题: '项目名称：__________', 页脚: '团队：__________' } },
)

export const ALL_TEMPLATES: 模板项[] = [
  ...WORD_TEMPLATES,
  ...TABLE_TEMPLATES,
  ...PPT_TEMPLATES
]

/** 将演示模板生成编辑器可直接修改的幻灯片模型。 */
export function 生成演示模板文稿(模板: 模板项): 演示文稿 {
  if (模板.分类 !== 'ppt' || !模板.演示设置) throw new Error('演示模板缺少幻灯片设置')
  const { 背景色, 标题, 副标题, 页脚 } = 模板.演示设置
  const 文稿 = 创建演示文稿(`${模板.名称}.pptx`)
  const 标题框 = { ...创建文本框(80, 135, 800, 85, 标题, 48), 加粗: true, 颜色: '#FFFFFF', 对齐: 'center' as const }
  const 副标题框 = { ...创建文本框(80, 255, 800, 55, 副标题, 28), 颜色: '#FFFFFF', 对齐: 'center' as const }
  const 页脚框 = { ...创建文本框(80, 365, 800, 40, 页脚, 19), 颜色: '#FFFFFF', 对齐: 'center' as const }
  const 默认章节: Record<string, Array<{ 标题: string; 要点: string[] }>> = {
    'ppt-business-001': [{ 标题: '会议议程', 要点: ['背景与目标', '当前进展', '关键决策'] }, { 标题: '核心数据', 要点: ['指标一：__________', '指标二：__________', '趋势与原因：__________'] }, { 标题: '下一步行动', 要点: ['负责人：__________', '完成时间：__________'] }],
    'ppt-education-001': [{ 标题: '学习目标', 要点: ['理解核心概念', '完成实际练习', '掌握检查方法'] }, { 标题: '课程内容', 要点: ['知识点一：__________', '知识点二：__________', '案例：__________'] }, { 标题: '练习与回顾', 要点: ['练习任务：__________', '常见问题：__________'] }],
    'ppt-product-001': [{ 标题: '用户痛点', 要点: ['目标用户：__________', '现有问题：__________'] }, { 标题: '产品亮点', 要点: ['功能一：__________', '功能二：__________', '差异化价值：__________'] }, { 标题: '发布计划', 要点: ['上线时间：__________', '下一阶段：__________'] }],
  }
  const 章节 = 模板.演示设置.章节 ?? 默认章节[模板.id] ?? [
    { 标题: '背景与目标', 要点: ['当前情况：__________', '希望达成：__________'] },
    { 标题: '关键内容', 要点: ['要点一：__________', '要点二：__________', '数据或案例：__________'] },
    { 标题: '下一步计划', 要点: ['行动一：__________', '负责人及时间：__________'] },
  ]
  return {
    ...文稿,
    幻灯片列表: [{
      ...文稿.幻灯片列表[0],
      title: 模板.名称,
      版式: '空白',
      背景色,
      文本框列表: [标题框, 副标题框, 页脚框],
    }, ...章节.map((章节项, 索引) => ({
      ...创建幻灯片('空白', 章节项.标题),
      title: 章节项.标题,
      背景色: '#FFFFFF',
      文本框列表: [
        { ...创建文本框(72, 58, 820, 74, 章节项.标题, 38), 加粗: true, 颜色: 背景色 },
        ...章节项.要点.map((要点, 要点序号) => ({ ...创建文本框(92, 162 + 要点序号 * 92, 780, 64, `• ${要点}`, 25), 颜色: '#253247' })),
        { ...创建文本框(72, 480, 820, 28, `${索引 + 2} / ${章节.length + 1}`, 14), 颜色: '#697386', 对齐: 'right' as const },
      ],
    }))],
  }
}

/**
 * 根据分类获取模板列表
 */
export function 获取模板列表(分类: string): 模板项[] {
  if (分类 === 'all') return ALL_TEMPLATES
  return ALL_TEMPLATES.filter(项 => 项.分类 === 分类)
}

/**
 * 根据 ID 获取单个模板
 */
export function 获取模板(id: string): 模板项 | undefined {
  return ALL_TEMPLATES.find(项 => 项.id === id)
}
