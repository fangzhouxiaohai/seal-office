const { 生成数学Xml, 读取数学表达式, 校验公式, 解析公式表达式 } = require('./formulas')

it('普通文本与上标生成原生数学部件并可原样读回', () => {
  const xml = 生成数学Xml('E = m c^2')
  expect(xml).toContain('<m:oMathPara')
  expect(xml).toContain('<m:oMath>')
  expect(xml).toContain('<m:sSup>')
  expect(xml).toContain('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"')
  expect(读取数学表达式(xml)).toBe('E = m c^2')
})

it('下标、分数与根号按原生数学结构写入并读回', () => {
  const 下标 = 生成数学Xml('a_1')
  expect(下标).toContain('<m:sSub>')
  expect(读取数学表达式(下标)).toBe('a_1')
  const 分数 = 生成数学Xml('\\frac{a}{b}')
  expect(分数).toContain('<m:f>')
  expect(分数).toContain('<m:num>')
  expect(分数).toContain('<m:den>')
  expect(读取数学表达式(分数)).toBe('\\frac{a}{b}')
  const 根号 = 生成数学Xml('\\sqrt{x+1}')
  expect(根号).toContain('<m:rad>')
  expect(读取数学表达式(根号)).toBe('\\sqrt{x+1}')
})

it('嵌套结构与上下标组合往返一致', () => {
  for (const 表达式 of ['\\frac{a^2}{\\sqrt{b}}', 'x^{n+1}', 'y_{i}^{2}', '\\sqrt{\\frac{1}{n}}']) {
    expect(读取数学表达式(生成数学Xml(表达式))).toBe(表达式)
  }
})

it('希腊字母宏写入规范字符并按规范形式读回', () => {
  expect(读取数学表达式(生成数学Xml('面积 S = \\pi r^2'))).toBe('面积 S = π r^2')
  expect(生成数学Xml('\\alpha\\beta')).toContain('αβ')
})

it('XML 特殊字符被正确转义且读回还原', () => {
  const 表达式 = 'a < b & c > d "e"'
  const xml = 生成数学Xml(表达式)
  expect(xml).toContain('&lt;')
  expect(xml).toContain('&amp;')
  expect(xml).not.toContain('a < b')
  expect(读取数学表达式(xml)).toBe(表达式)
})

it('不支持的语法在写入前明确拒绝，不做静默降级', () => {
  expect(() => 生成数学Xml('\\int_0^1 x')).toThrow('公式语法不支持')
  expect(() => 生成数学Xml('\\begin{matrix}a\\end{matrix}')).toThrow('公式语法不支持')
  expect(() => 生成数学Xml('a^{')).toThrow('公式括号不匹配')
})

it('校验拒绝空表达式与超长表达式', () => {
  expect(() => 校验公式('')).toThrow('公式表达式不能为空')
  expect(() => 校验公式('x'.repeat(1001))).toThrow('公式表达式过长')
  expect(() => 校验公式('a^2')).not.toThrow()
})

it('读取本机不支持的原生数学结构返回空并给出原因，不伪造文本', () => {
  const 外部 = '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>x</m:t></m:r></m:e></m:nary></m:oMath>'
  expect(读取数学表达式(外部)).toBeNull()
  const 空 = '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"/>'
  expect(读取数学表达式(空)).toBeNull()
})

it('外部软件的数学字母符号按基础字符恢复，便于继续编辑', () => {
  const 外部 = '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>𝑎</m:t></m:r><m:sSup><m:e><m:r><m:t>𝑏</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+𝜋</m:t></m:r></m:oMath>'
  expect(读取数学表达式(外部)).toBe('ab^2+π')
})

it('解析结果可用于界面回显（节点结构稳定）', () => {
  const 节点 = 解析公式表达式('\\frac{a}{b}')
  expect(节点).toEqual([{ 类型: '分数', 分子: [{ 类型: '文本', 文本: 'a' }], 分母: [{ 类型: '文本', 文本: 'b' }] }])
})
