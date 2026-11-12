// 识别结果核对面板：异常清单（字段模糊 / 数字不符 / 必填缺失 / 模板不匹配）+ 可编辑的结构化结果。
// 扫描工具箱的模板化识别与单据转表格共用。异常格高亮，修改后自动重新校验。
import { Button, Checkbox, Empty, Input, Tag } from 'antd'
import type { 识别模板 } from './templates'
import type { 单据解析结果, 异常项 } from './validation'
import { 修改键, 异常键, type 修改表 } from './reviewModel'

interface Props {
  模板: 识别模板
  结果列表: 单据解析结果[]
  异常清单: 异常项[]
  已核对: Set<string>
  修改: 修改表
  失败: Array<{ 来源: string; 原因: string }>
  切换核对: (键: string, 选中: boolean) => void
  修改字段: (来源: string, 行: number | null, 键: string, 值: string) => void
  查看原图: (来源: string) => void
}

export default function ReviewPanel({ 模板, 结果列表, 异常清单, 已核对, 修改, 失败, 切换核对, 修改字段, 查看原图 }: Props) {
  const 异常级别 = (来源: string, 行: number | null, 键: string) => 异常清单.find(项 => 项.来源 === 来源 && 项.行 === 行 && 项.字段.includes(键))?.级别
  const 取值 = (结果: 单据解析结果, 行: number | null, 键: string) => 修改[修改键(结果.来源, 行, 键)] ?? (行 === null ? 结果.表头.值[键] : 结果.明细[行 - 1]?.值[键]) ?? ''
  const 待处理 = 异常清单.filter(项 => !已核对.has(异常键(项))).length
  return <div className="scan-review">
    <section className="scan-card" aria-label="异常清单">
      <header className="scan-card__head">
        <h2>异常清单</h2>
        <span className="scan-help">{待处理 ? `${待处理} 项待核对` : '全部异常已核对'}</span>
      </header>
      {失败.map(项 => <p className="scan-review__failure" key={项.来源} role="alert"><Tag color="error">识别失败</Tag><span data-ui-language-ignore="true">{项.来源}</span>：{项.原因}</p>)}
      {异常清单.length === 0 && !失败.length ? <p className="scan-help">没有发现模糊、数字不符或必填缺失的字段，仍请对照原图核对关键数字。</p> : <ul className="scan-review__issues">
        {异常清单.map(项 => {
          const 键 = 异常键(项)
          return <li key={键} data-level={项.级别}>
            <Tag color={项.级别 === '错误' ? 'error' : 'warning'}>{项.类型}</Tag>
            <span className="scan-review__issue-text">
              <strong>{项.说明}</strong>
              <small><span data-ui-language-ignore="true">{项.来源}</span>{项.行 !== null ? ` · 第 ${项.行} 行` : ''}</small>
            </span>
            <Button size="small" onClick={() => 查看原图(项.来源)}>查看原图</Button>
            <Checkbox checked={已核对.has(键)} onChange={事件 => 切换核对(键, 事件.target.checked)}>已核对</Checkbox>
          </li>
        })}
      </ul>}
    </section>
    {结果列表.map(结果 => <section className="scan-card" key={结果.来源} aria-label="识别结果">
      <header className="scan-card__head">
        <h2 data-ui-language-ignore="true">{结果.来源}</h2>
        <Button size="small" onClick={() => 查看原图(结果.来源)}>查看原图</Button>
      </header>
      {!结果.模板匹配 ? <Empty description="识别内容与所选单据类型不符，未生成表格行" /> : <>
        {模板.表头字段.length > 0 && <div className="scan-review__fields">
          {模板.表头字段.map(字段 => <label key={字段.键} data-level={异常级别(结果.来源, null, 字段.键)}>
            <span>{字段.名称}{字段.必填 ? <em aria-hidden="true">*</em> : null}</span>
            <Input size="small" aria-label={字段.名称} value={取值(结果, null, 字段.键)} onChange={事件 => 修改字段(结果.来源, null, 字段.键, 事件.target.value)} />
          </label>)}
        </div>}
        {模板.明细字段.length > 0 && (结果.明细.length ? <div className="scan-review__table-wrap"><table className="scan-review__table">
          <thead><tr><th scope="col">序号</th>{模板.明细字段.map(字段 => <th scope="col" key={字段.键}>{字段.名称}</th>)}</tr></thead>
          <tbody>{结果.明细.map((_行, 序号) => <tr key={序号}>
            <th scope="row">{序号 + 1}</th>
            {模板.明细字段.map(字段 => <td key={字段.键} data-level={异常级别(结果.来源, 序号 + 1, 字段.键)}>
              {模板.分类 === '试卷' && 字段.键 === '题目'
                ? <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} aria-label={字段.名称} value={取值(结果, 序号 + 1, 字段.键)} onChange={事件 => 修改字段(结果.来源, 序号 + 1, 字段.键, 事件.target.value)} />
                : <Input size="small" aria-label={字段.名称} value={取值(结果, 序号 + 1, 字段.键)} onChange={事件 => 修改字段(结果.来源, 序号 + 1, 字段.键, 事件.target.value)} />}
            </td>)}
          </tr>)}</tbody>
        </table></div> : <p className="scan-help">未识别到明细行，请对照原图补录</p>)}
      </>}
    </section>)}
  </div>
}
