// Storage names from MS-XLSX 2.2.3 Functions, independently of the local evaluator.
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/5d1b6d44-6fc1-4ecd-8fef-0b27406cc2bf
// XlsxWriter's public format guide also documents ANCHORARRAY / XMATCH and legacy aliases.
// https://xlsxwriter.readthedocs.io/working_with_formulas.html
const 未来函数 = new Set(`ACOT ACOTH AGGREGATE ARABIC ARRAYTOTEXT BASE BETA.DIST BETA.INV BINOM.DIST BINOM.DIST.RANGE BINOM.INV BITAND BITLSHIFT BITOR BITRSHIFT BITXOR BYCOL BYROW CEILING.MATH CEILING.PRECISE CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CHOOSECOLS CHOOSEROWS COMBINA CONCAT CONFIDENCE.NORM CONFIDENCE.T COT COTH COVARIANCE.P COVARIANCE.S CSC CSCH DAYS DECIMAL DROP ERF.PRECISE ERFC.PRECISE EXPAND EXPON.DIST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST FIELDVALUE FILTERXML FLOOR.MATH FLOOR.PRECISE FORECAST.ETS FORECAST.ETS.CONFINT FORECAST.ETS.SEASONALITY FORECAST.ETS.STAT FORECAST.LINEAR FORMULATEXT GAMMA GAMMA.DIST GAMMA.INV GAMMALN.PRECISE GAUSS HSTACK HYPGEOM.DIST IFNA IFS IMAGE IMCOSH IMCOT IMCSC IMCSCH IMSEC IMSECH IMSINH IMTAN ISFORMULA ISOMITTED ISOWEEKNUM LAMBDA LET LOGNORM.DIST LOGNORM.INV MAKEARRAY MAP MAXIFS MINIFS MODE.MULT MODE.SNGL MUNIT NEGBINOM.DIST NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NUMBERVALUE PDURATION PERCENTILE.EXC PERCENTILE.INC PERCENTRANK.EXC PERCENTRANK.INC PERMUTATIONA PHI POISSON.DIST PQSOURCE PYTHON_STR PYTHON_TYPE PYTHON_TYPENAME QUARTILE.EXC QUARTILE.INC QUERYSTRING RANDARRAY RANK.AVG RANK.EQ REDUCE RRI SCAN SEC SECH SEQUENCE SHEET SHEETS SKEW.P SORTBY STDEV.P STDEV.S SWITCH T.DIST T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST TAKE TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TOCOL TOROW UNICHAR UNICODE UNIQUE VALUETOTEXT VAR.P VAR.S VSTACK WEBSERVICE WEIBULL.DIST WRAPCOLS WRAPROWS XLOOKUP XMATCH XOR Z.TEST ANCHORARRAY SINGLE`.split(' '))
const 工作表函数 = new Set(['FILTER', 'SORT', 'PY'])

/** OOXML stores the public A1# operator as ANCHORARRAY(A1). Strings and external/structured references are untouched. */
function 规范溢出引用(公式) {
  let 输出 = '', 位置 = 0
  while (位置 < 公式.length) {
    const 字符 = 公式[位置]
    if (字符 === '"') {
      const 开始 = 位置++
      while (位置 < 公式.length) { if (公式[位置++] === '"') { if (公式[位置] === '"') 位置++; else break } }
      输出 += 公式.slice(开始, 位置); continue
    }
    if (字符 === '[') {
      const 开始 = 位置++; let 深度 = 1
      while (位置 < 公式.length && 深度) { if (公式[位置] === '[') 深度++; if (公式[位置++] === ']') 深度-- }
      const 外部 = /^[^+\-*/(),;=<>\s]*![\$A-Za-z\d]+#/.exec(公式.slice(位置))
      if (外部) 位置 += 外部[0].length
      输出 += 公式.slice(开始, 位置); continue
    }
    const 引用 = /^(?:(?:'(?:[^']|'')+'|[\p{L}_\\][\p{L}\p{N}_.\\]*)!)?\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}#/u.exec(公式.slice(位置))
    if (引用 && !/[\p{L}\p{N}_.!]/u.test(公式[位置 - 1] ?? '')) {
      输出 += `_xlfn.ANCHORARRAY(${引用[0].slice(0, -1)})`; 位置 += 引用[0].length; continue
    }
    if (字符 === "'") {
      const 开始 = 位置++
      while (位置 < 公式.length) { if (公式[位置++] === "'") { if (公式[位置] === "'") 位置++; else break } }
      输出 += 公式.slice(开始, 位置); continue
    }
    输出 += 公式[位置++]
  }
  return 输出
}

/** 新建公式使用标准 OOXML 存储名，已有来源公式可由调用方显式保留原拼写。 */
function 规范公式函数名(公式) {
  公式 = 规范溢出引用(公式)
  let 输出 = '', 位置 = 0
  while (位置 < 公式.length) {
    const 字符 = 公式[位置]
    if (字符 === '"' || 字符 === "'") {
      const 起点 = 位置++
      while (位置 < 公式.length) {
        if (公式[位置++] === 字符) { if (公式[位置] === 字符) 位置++; else break }
      }
      输出 += 公式.slice(起点, 位置); continue
    }
    if (字符 === '[') {
      const 起点 = 位置++; let 深度 = 1
      while (位置 < 公式.length && 深度) { if (公式[位置] === '[') 深度++; if (公式[位置++] === ']') 深度-- }
      输出 += 公式.slice(起点, 位置); continue
    }
    const 标识 = /^[A-Za-z_][A-Za-z\d_.]*/.exec(公式.slice(位置))?.[0]
    if (!标识) { 输出 += 公式[位置++]; continue }
    const 大写 = 标识.toUpperCase()
    const 是调用 = /^\s*\(/.test(公式.slice(位置 + 标识.length)) && !/[\p{L}\p{N}_.!]/u.test(公式[位置 - 1] ?? '')
    输出 += 是调用 && 工作表函数.has(大写) ? `_xlfn._xlws.${大写}` : 是调用 && 未来函数.has(大写) ? `_xlfn.${大写}` : 标识
    位置 += 标识.length
  }
  return 输出
}

module.exports = { 规范公式函数名 }
