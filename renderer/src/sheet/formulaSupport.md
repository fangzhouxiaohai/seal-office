# 公式计算支持范围（2.0.0）

当前有 263 个明确注册的函数名。安全解析器继续使用 token 和递归下降，不执行 eval、Function、宏、环境命令或库内部 helper。Formula.js 4.6.1（MIT）提供经筛选的标量算法；动态数组、日期、Unicode、二维查找、ROUND、组合数/整数算法、特定上游差异由本地适配实现。

## 值、区域与错误

- 区域按行展平，WeakMap 记录二维形状；普通 SUM 等现有聚合参数仍是一维数组。VLOOKUP/HLOOKUP/INDEX 使用真实行列，ROWS/COLUMNS 读取形状。INDEX 的行号或列号为 0 时返回整列/整行，二维结果由工作簿统一展开。
- 支持二维数组常量、兼容形状的逐元素运算和标量函数广播；实现 SEQUENCE、FILTER、SORT、SORTBY、UNIQUE、TRANSPOSE、TAKE、DROP、CHOOSECOLS、CHOOSEROWS、HSTACK、VSTACK、TOCOL、TOROW、EXPAND、WRAPROWS、WRAPCOLS。支持本表/跨表 A1#，原生 XLSX 保存为规范 ANCHORARRAY 调用及 XLDAPR 元数据，各结果格保留真实数值/文字/布尔/错误缓存。
- 实际内容、公式返回空文本、合并区域、其他数组、物理边界和安全显示预算会阻止展开并显示 #SPILL!；格式本身不阻塞。子格只读并提示锚点，修改锚点或依赖时重新确定结果区域，删除锚点清理结果，独立格式仍保留。撤销/重做、跨表依赖及行列结构调整后重算。
- 未知函数、命名区域、结构化引用及未支持语法继续标记“未支持”，由模型保留来源缓存或显示待计算。未知动态数组的已有缓存可显示、保存，未提供的子格标记待计算，不伪造 0。旧式 CSE 数组继续保留来源缓存，不能仅凭函数名称自动升级为动态数组。
- 标量计算错误（含库返回 Error）仍显示 #错误，1/0 不回退为旧缓存。数组中的局部错误使用有类型的错误标记，可被 FILTER 排除或由 IFERROR 逐元素替换；普通文字“#N/A”不被误当成错误。
- IF、IFERROR、IFNA 和 ISERROR/ISERR/ISNA 保持惰性分支；数组条件按元素选择，所有元素都不需要的分支不求值。未知函数被选中时继续“未支持”，不会被 IFERROR 当作已计算结果吞掉。IF 当前接收三个参数。
- MATCH 精确匹配支持通配符，近似匹配需按模式排序；VLOOKUP/HLOOKUP 支持精确与升序近似匹配。XLOOKUP 支持 3—6 参数、精确/相邻值匹配、正向/反向线性搜索以及返回二维行/列；通配符模式、二分搜索和多值 lookup_value 尚未实现，保留来源缓存而不伪造标量结果。
- 条件统计检查参数配对及区域形状。SUMIF/AVERAGEIF 需要扩展到给定区域之外时保留来源缓存；SUMIFS/COUNTIFS 等形状不一致视为计算错误。

## 文本与日期

- 默认 Excel 模式的 LEFT/RIGHT/MID/LEN/REPLACE、FIND/SEARCH 位置按 Unicode 码点计数，保留 emoji/扩展汉字完整字符；组合音标和 ZWJ 序列按多个码点计数。ROUND 半数远离零，兼容十进制和科学计数。
- 本机 WPS 12.1、CalculationRule=0 的独立实测按 UTF-16 代码单元计数，直接引用空白格的数组保留空串，和上述默认模式存在差异。导入其明确来源标记时自动选择 WPS 模式；公式栏可手动切换整个工作簿的 Excel/WPS 模式，XLSX 用独立属性保存这个明确选择。日期基准和兼容模式均为解析器实例上下文，不使用全局可变标志。
- WPS 的 LEFT/MID 等可能返回孤立代理项。内存按实测代码单元保留；XML 无法表示这种结果时省略该缓存并保留公式及兼容模式，重开重新计算，不能静默把公式结果改成 U+FFFD。此模式对应已实测的 WPS 版本，不能宣称覆盖所有 WPS/Excel 版本的完整文本规则。
- 日期函数按 1900 日期系统返回序列号；Date 结果读取本地年月日和时间分量，再转 UTC 日差，避免时区/DST 偏移。保留虚构的 serial 60（1900-02-29）及 DATE(1900,1,60)、DATE(1900,3,0)；year 0—1899 加 1900；有效日期上限 9999-12-31。
- DATEVALUE 只接受明确的 yyyy-mm-dd 或 yyyy/mm/dd；TIMEVALUE 接受 HH:MM[:SS] 和英文 AM/PM。模糊的地区日期文本保留来源缓存。
- 求值公式第 5 可选参数可传 {日期系统1904:true}；日期基准保存在解析器实例并传入惰性子解析器，不使用全局标志。只对参数角色为日期的序列/假日和返回日期调整 1462，月份、日数、周末代码和 TIME/TIMEVALUE 的纯时间单位不偏移；假日空格不变成日期。导入层须从原 workbookPr 的 1/true 标记传递基准，保存时工作表基准必须一致。
- WORKDAY、WORKDAY.INTL、NETWORKDAYS、NETWORKDAYS.INTL 支持日期/天数/周末参数的形状广播；假日范围始终作为一整个假日集合传给每个结果，不能逐元素拆成对应假日。1904 数组日期、闰日、工作日、周末和假日另以真实 XLSX 错缓存输入，由 LibreOffice 与本机 WPS 分别强制重算 15 组，均 15/15 一致；WPS 原生另存件再次导入本机计算也 15/15 一致。
- 一个数组/区域最多 100000 格，自动扩展后的可见工作表最多 100000 格；工作簿求值与候选扫描有 1000000 次操作预算。主进程读取动态缓存每区域最多 100000 格、每工作簿最多 1000000 格，超限有明确导入风险提示。高代价离散分布/分期/工作日/组合计算有本机上限，超出可计算预算标记未支持；阶乘溢出返回计算错误；公式/REPT 文本上限 32767。尚未实现的 volatile、证券日期算法、环境/上下文、LET/LAMBDA、映射规约及其他数组函数不注册。

## 验证与边界

原基础函数、扩展、模型、1904 上下文和公式兼容回归通过。独立 LibreOffice 26.8.1 隔离配置强制重算使用真实 main/office/xlsxCodec.js 新公式写出，记录原始式、标准 OOXML 存储式、重写式、原式/存储式两种引擎结果。228 个原始函数样例保留全部行；补充 TYPE("abc") 与 24 小时文本时间两个共同语义控制。TYPE(TRUE) 的 Calc 返回 1、Excel 返回 4，以及本机 Calc 不解析英文 PM 的差异在报告中保留。另用明确 date1904 工作簿独立重算 33 个日期/时间/工作日/假日/跨表/惰性样例，并将 LO 文件经真实导入、编辑、保存重开后交回 LO 再核对。数值比较容差为 max(1e-7, |oracle|×1e-9)，函数清单不表示所有第三方引擎的全部参数、类型强制转换及数组语义完全一致。

数组另用真实主进程新建 XLSX、全部结果缓存故意写错为 9999，再由独立引擎强制重算。LibreOffice 26.8.1 为 32/33，唯一失败为不识别标准 ANCHORARRAY；本机 WPS 为 31/33，原有两个 Unicode/空白语义差异完整保留，应用 WPS 来源模式后实际原生文件导入、本机重新计算为 33/33，编辑依赖和原生保存重开也通过。WPS 原生动态数组二次编辑还验证了跨表 # 引用随 SEQUENCE 从 3×2 扩为 4×2 自动扩展。

WPS 对动态元数据扩展 URI 的 GUID 大小写存在实际兼容差异：大写会使其另存为旧 CSE，小写可保留 XLDAPR 与 cm。采用原生 WPS 和标准示例一致的小写写出，读取仍兼容两种大小写。通过 calcFeatures、calcId、关系 ID 变体排除的否定证据保留，不把猜测当成修复。

证据位于 .upgrade-private/formula-verification/ 与 .upgrade-private/spill-verification/，后者包括所有原始 oracle 差异、WPS COM 观察、受控 XML 变体、真实主进程往返、生产浏览器私有构建的 file/http 输入和截图。COM 是本机应用黑盒观察，REA 的证据仅证明其动态元数据读写入口，不声称恢复了 WPS 内部溢出算法。最终发行资源仍需统一构建后再执行生产端回归。

## 实际函数清单

- **A**：ABS、ACOS、ACOSH、ACOT、ACOTH、ANCHORARRAY、AND、ASIN、ASINH、ATAN、ATAN2、ATANH、AVEDEV、AVERAGE、AVERAGEA、AVERAGEIF、AVERAGEIFS
- **B**：BETA.DIST、BETA.INV、BINOM.DIST、BINOM.INV
- **C**：CEILING、CEILING.MATH、CEILING.PRECISE、CHAR、CHISQ.DIST、CHISQ.DIST.RT、CHISQ.INV、CHISQ.INV.RT、CHOOSECOLS、CHOOSEROWS、CLEAN、CODE、COLUMNS、COMBIN、COMBINA、CONCAT、CONCATENATE、CONFIDENCE.NORM、CONFIDENCE.T、CORREL、COS、COSH、COT、COTH、COUNT、COUNTA、COUNTBLANK、COUNTIF、COUNTIFS、COVARIANCE.P、COVARIANCE.S、CSC、CSCH、CUMIPMT、CUMPRINC
- **D**：DATE、DATEVALUE、DAY、DAYS、DB、DDB、DEGREES、DEVSQ、DROP
- **E**：EDATE、EFFECT、EOMONTH、EVEN、EXACT、EXP、EXPAND、EXPON.DIST
- **F**：F.DIST、F.DIST.RT、F.INV、F.INV.RT、FACT、FACTDOUBLE、FALSE、FILTER、FIND、FISHER、FISHERINV、FLOOR、FLOOR.MATH、FLOOR.PRECISE、FV、FVSCHEDULE
- **G**：GAMMA、GAMMALN、GAUSS、GCD、GEOMEAN
- **H**：HARMEAN、HLOOKUP、HOUR、HSTACK、HYPGEOM.DIST
- **I**：IF、IFERROR、IFNA、INDEX、INT、INTERCEPT、IPMT、IRR、ISBLANK、ISERR、ISERROR、ISLOGICAL、ISNA、ISNONTEXT、ISNUMBER、ISOWEEKNUM、ISPMT、ISTEXT
- **K**：KURT
- **L**：LARGE、LCM、LEFT、LEN、LN、LOG、LOG10、LOGNORM.DIST、LOGNORM.INV、LOWER
- **M**：MATCH、MAX、MAXA、MAXIFS、MEDIAN、MID、MIN、MINA、MINIFS、MINUTE、MIRR、MOD、MODE.SNGL、MONTH、MROUND
- **N**：N、NA、NEGBINOM.DIST、NETWORKDAYS、NETWORKDAYS.INTL、NOMINAL、NORM.DIST、NORM.INV、NORM.S.DIST、NORM.S.INV、NOT、NPER、NPV、NUMBERVALUE
- **O**：ODD、OR
- **P**：PDURATION、PEARSON、PERCENTILE.EXC、PERCENTILE.INC、PERCENTRANK.EXC、PERCENTRANK.INC、PERMUT、PERMUTATIONA、PHI、PI、PMT、POISSON.DIST、POWER、PPMT、PROB、PRODUCT、PROPER、PV
- **Q**：QUARTILE.EXC、QUARTILE.INC、QUOTIENT
- **R**：RADIANS、RANK.AVG、RANK.EQ、RATE、REPLACE、REPT、RIGHT、ROUND、ROUNDDOWN、ROUNDUP、ROWS、RRI、RSQ
- **S**：SEARCH、SEC、SECH、SECOND、SEQUENCE、SIGN、SIN、SINH、SKEW、SKEW.P、SLN、SLOPE、SMALL、SORT、SORTBY、SQRT、SQRTPI、STANDARDIZE、STDEV.P、STDEV.S、STDEVA、STDEVPA、STEYX、SUBSTITUTE、SUM、SUMIF、SUMIFS、SUMPRODUCT、SUMSQ、SYD
- **T**：T.DIST、T.DIST.2T、T.DIST.RT、T.INV、T.INV.2T、TAKE、TAN、TANH、TEXTJOIN、TIME、TIMEVALUE、TOCOL、TOROW、TRANSPOSE、TRIM、TRIMMEAN、TRUE、TRUNC、TYPE
- **U**：UNICHAR、UNICODE、UNIQUE、UPPER
- **V**：VALUE、VAR.P、VAR.S、VARA、VARPA、VLOOKUP、VSTACK
- **W**：WEEKDAY、WEEKNUM、WEIBULL.DIST、WORKDAY、WORKDAY.INTL、WRAPCOLS、WRAPROWS
- **X**：XLOOKUP、XOR
- **Y**：YEAR

算法依赖与规则来源：[Formula.js 官方](https://github.com/formulajs/formulajs)、[Microsoft 日期规则](https://support.microsoft.com/en-gb/excel/functions/date-function?appver=zxl160&helpid=xlmain11.chm60113&ns=excel&syslcid=2057&uilcid=2057&version=16)、[Microsoft 1900 闰年兼容说明](https://learn.microsoft.com/en-US/office/troubleshoot/excel/wrongly-assumes-1900-is-leap-year)、[OOXML 函数存储名称](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0)。
