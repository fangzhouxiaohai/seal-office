// 模板库数据
import { 创建演示文稿, 创建文本框, type 演示文稿 } from '../ppt/deck'

export interface 模板项 {
  id: string
  名称: string
  分类: 'word' | 'table' | 'ppt'
  描述: string
  内容: string
  标签?: string[]
  演示设置?: { 背景色: string; 标题: string; 副标题: string; 页脚: string }
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
  return {
    ...文稿,
    幻灯片列表: [{
      ...文稿.幻灯片列表[0],
      title: 模板.名称,
      版式: '空白',
      背景色,
      文本框列表: [标题框, 副标题框, 页脚框],
    }],
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
