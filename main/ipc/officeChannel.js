const { 生成docx } = require('../office/docxWriter')
const { 读取docx } = require('../office/docxReader')
const { 读取xlsx, 写入xlsx } = require('../office/xlsxCodec')
const { 读取pptx, 写入pptx } = require('../office/pptxCodec')
const { 生成说明 } = require('../office/lossReport')
const { 读取兼容文档, 写入兼容文档 } = require('../office/compatibleFormats')
const {readSeal,writeSeal}=require('../office/sealFormat')

function 注册Office通道(ipcMain) {
  ipcMain.handle('office.readSeal',async(_event,扩展,数据)=>执行(()=>readSeal(扩展,Buffer.from(数据,'base64'))))
  ipcMain.handle('office.writeSeal',async(_event,类型,数据)=>执行数据(()=>writeSeal(类型,数据)))
  ipcMain.handle('office.readCompatible', async (_event, 扩展, 数据) => 执行(() => 读取兼容文档(扩展, Buffer.from(数据, 'base64'))))
  ipcMain.handle('office.writeCompatible', async (_event, 类型, 扩展, 模型) => 执行数据(() => 写入兼容文档(类型, 扩展, 模型)))
  ipcMain.handle('office.writeDocx', async (_event, 模型) => {
    try {
      const 数据 = await 生成docx(模型)
      return { 成功: true, 数据: 数据.toString('base64'), 损失说明: 生成说明((模型 && 模型.未覆盖 || []).map((名称) => ({ 名称, 次数: 1 }))) }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '生成文字文档失败' }
    }
  })
  ipcMain.handle('office.readDocx', async (_event, 数据) => 执行(() => 读取docx(Buffer.from(数据, 'base64'))))
  ipcMain.handle('office.readXlsx', async (_event, 数据) => 执行(() => 读取xlsx(Buffer.from(数据, 'base64'))))
  ipcMain.handle('office.writeXlsx', async (_event, 模型) => 执行数据(() => 写入xlsx(模型)))
  ipcMain.handle('office.readPptx', async (_event, 数据) => 执行(() => 读取pptx(Buffer.from(数据, 'base64'))))
  ipcMain.handle('office.writePptx', async (_event, 模型) => 执行数据(() => 写入pptx(模型)))
}

async function 执行(任务) {
  try { return { 成功: true, ...(await 任务()) } } catch (错误) { return { 成功: false, 错误: 错误.message || '格式转换失败' } }
}
async function 执行数据(任务) {
  try { return { 成功: true, 数据: Buffer.from(await 任务()).toString('base64') } } catch (错误) { return { 成功: false, 错误: 错误.message || '格式转换失败' } }
}

module.exports = { 注册Office通道 }
