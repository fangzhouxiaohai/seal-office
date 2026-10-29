// 隔离真实浏览器验收；可选 --source 只读本机原件，报告不写入单元格内容。
// 运行：electron scripts/verify-sheet-layout.cjs [--source 本机路径] [--label 报告后缀]
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const root = path.resolve(__dirname, '..')
const option = key => { const i = process.argv.indexOf(key); return i < 0 ? null : process.argv[i + 1] }
const supplied = option('--source')
const label = (option('--label') || (supplied ? 'local-source' : 'synthetic')).replace(/[^a-z0-9-]/gi, '')
const output = path.join(root, '.upgrade-private/sheet-layout', label)
const reportPath = path.join(root, 'docs/verification/v2.2.2', `sheet-layout-${label}.json`)
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const report = { 通过: false, 来源类型: supplied ? '本机只读样例' : '完全合成样例', 阶段毫秒: {}, 检查: [] }
const start = performance.now()
let source, beforeHash, win, stage = '初始化', savePath, saves = 0, bridgeReads = 0, bridgeWrites = 0
function check(name, condition, metrics = {}) {
  report.检查.push({ 项目: name, 通过: !!condition, ...metrics })
  if (!condition) throw new Error(name)
}
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(output, { recursive: true })
    stage = '加载编解码依赖'
    let mark = performance.now()
    const ExcelJS = require('exceljs'), JSZip = require('jszip')
    const { 读取xlsx, 写入xlsx } = require('../main/office/xlsxCodec')
    const { readSeal, writeSeal } = require('../main/office/sealFormat')
    report.阶段毫秒.冷依赖加载 = Math.round(performance.now() - mark)
    source = supplied ? path.resolve(supplied) : path.join(output, 'synthetic.xlsx')
    if (!supplied) {
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('合成主表')
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2, zoomScale: 70, showGridLines: false }]
      ws.getCell('A1').value = '完全合成验收资料'; ws.mergeCells('A1:R1')
      for (let r = 2; r <= 39; r++) for (let c = 1; c <= 18; c++) {
        ws.getCell(r,c).value = r === 2 ? '合成列' + c : r * c
        ws.getCell(r,c).font = { name: 'Arial', size: 9 }
        ws.getCell(r,c).border = { bottom: { style: 'thin' }, right: { style: 'thin' } }
      }
      ws.getCell('R39').value = { formula: 'SUM(B39:Q39)', result: 39 * 152 }
      ws.getCell('B4').alignment = { shrinkToFit: true }; ws.getCell('B4').value = '合成缩小填充验证文字'
      ws.getColumn(1).width = 12; ws.getColumn(2).width = 5
      wb.addWorksheet('合成附表一').getCell('A1').value = 101
      wb.addWorksheet('合成附表二').getCell('A1').value = 202
      const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer())
      let xml = await zip.file('xl/worksheets/sheet1.xml').async('string')
      xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, '<cols><col min="1" max="16384" width="9" style="1" customWidth="1"/></cols>')
      zip.file('xl/worksheets/sheet1.xml', xml)
      fs.writeFileSync(source, await zip.generateAsync({type:'nodebuffer'}))
    }
    const bytes = fs.readFileSync(source); beforeHash = hash(bytes)
    report.来源 = { 字节数: bytes.length, SHA256: beforeHash }
    const original = new ExcelJS.Workbook(); await original.xlsx.load(bytes)
    const contentHashes = workbook => workbook.worksheets.map(ws => {
      const rows = []
      ws.eachRow(row => row.eachCell(cell => {
        if (cell.type === ExcelJS.ValueType.Merge || (cell.value === null || cell.value === '')) return
        const value = cell.value
        // 共享公式与普通公式按展开后的原文比较，不把缓存更新误判为改写内容。
        rows.push([cell.address, cell.formula ? { formula: cell.formula } : value])
      }))
      return { 数量: rows.length, SHA256: hash(JSON.stringify(rows)) }
    })
    const rawHashes = contentHashes(original)
    report.原始内容摘要 = rawHashes
    mark = performance.now(); const decoded = await 读取xlsx(bytes)
    report.阶段毫秒.首次解析已加载依赖 = Math.round(performance.now() - mark)
    check('来源工作表数量', decoded.工作表列表.length === 3, { 数量: decoded.工作表列表.length })
    check('支持特性不产生导入警告', decoded.警告.length === 0, { 警告数量: decoded.警告.length })
    const safe = p => {
      const absolute = path.resolve(p)
      if (absolute === source || absolute.startsWith(output + path.sep)) return absolute
      throw new Error('验收文件访问超出隔离目录')
    }
    ipcMain.handle('audit.read', async (_, p) => {
      const b = fs.readFileSync(safe(p)); bridgeReads++
      return { 成功: true, 内容: b.toString('base64'), 二进制: true, 扩展名: path.extname(p), 文件指纹: hash(b) }
    })
    ipcMain.handle('audit.saveDialog', () => savePath || null)
    ipcMain.handle('audit.save', async (_, p, data, format) => {
      const absolute = safe(p)
      if (absolute === source) throw new Error('禁止覆盖原件')
      const b = Buffer.from(data, format === '二进制' ? 'base64' : 'utf8')
      fs.writeFileSync(absolute, b); saves++
      return { 成功: true, 路径: absolute, 文件指纹: hash(b) }
    })
    ipcMain.handle('audit.readXlsx', async (_, data) => ({ 成功: true, ...await 读取xlsx(Buffer.from(data, 'base64')) }))
    ipcMain.handle('audit.writeXlsx', async (_, model) => { bridgeWrites++; return { 成功: true, 数据: (await 写入xlsx(model)).toString('base64') } })
    ipcMain.handle('audit.readSeal', async (_, ext, data) => ({ 成功: true, ...await readSeal(ext, Buffer.from(data, 'base64')) }))
    ipcMain.handle('audit.writeSeal', async (_, type, model) => { bridgeWrites++; return { 成功: true, 数据: (await writeSeal(type, model)).toString('base64') } })
    fs.writeFileSync(path.join(output, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');const invoke=(name)=>(...args)=>ipcRenderer.invoke('audit.'+name,...args);const yes=async()=>({成功:true});contextBridge.exposeInMainWorld('electronAPI',{readFile:invoke('read'),saveToFile:invoke('save'),showSaveDialog:invoke('saveDialog'),reportUnsavedCount:yes,recentList:async()=>({成功:true,数据:[]}),recentAdd:yes,backupLoad:async()=>({成功:true,内容:null}),backupSave:yes,fonts:{list:async()=>({成功:true,数据:{系统:[],自定义:[],平台:'win32'}})},office:{readXlsx:invoke('readXlsx'),writeXlsx:invoke('writeXlsx'),readSeal:invoke('readSeal'),writeSeal:invoke('writeSeal')}});`)
    stage = '构建实际编辑组件'; mark = performance.now()
    const entry = `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
      import {SettingsProvider} from './renderer/src/store/settingsStore';import SheetEditor from './renderer/src/sheet/SheetEditor';
      import {准备打开本地文件,注册导入确认弹窗} from './renderer/src/fileOpen';
      import {创建工作表,写入单元格} from './renderer/src/sheet/model';
      import {应用主题} from './renderer/src/styles/themes';
      let store;window.auditPrompts=0;注册导入确认弹窗(o=>{window.auditPrompts++;o.onCancel?.()});
      const Harness=()=>{store=useAppStore();return store.activeDocumentId?<SheetEditor key={store.activeDocumentId}/>:null};
      应用主题('浅色');const mount=createRoot(document.getElementById('root'));
      flushSync(()=>mount.render(<SettingsProvider><ConfigProvider><AntdApp><AppProvider><Harness/></AppProvider></AntdApp></ConfigProvider></SettingsProvider>));
      window.openSource=async p=>{const data=await 准备打开本地文件(p);if(!data)return false;flushSync(()=>store.createDoc('table',data.工作表列表??data.内容,{路径:p,警告:data.警告,文件指纹:data.文件指纹}));return true};
      window.models=()=>store.表格文档模型[store.activeDocumentId];
      window.facts=()=>{const s=window.models(),g=document.querySelector('.wps-sheet');return {表数:s.length,行数:s[0].行数,列数:s[0].列数,合并数:s[0].合并区域.length,缩放:s[0].视图?.缩放,挂载格数:g?.querySelectorAll('.wps-sheet__cell').length,宽:g?.clientWidth,高:g?.clientHeight,滚动宽:g?.scrollWidth,滚动高:g?.scrollHeight,左:g?.scrollLeft,顶:g?.scrollTop,实际缩放:g?getComputedStyle(g).zoom:null,导入提示数:window.auditPrompts,弹窗数:document.querySelectorAll('.ant-modal').length}};
      window.change=(label,value)=>{const e=document.querySelector('[aria-label="'+label+'"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};
      window.press=key=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
      window.snapshot=()=>window.models().map(s=>({单元格:Object.fromEntries(Object.entries(s.单元格).filter(([a,c])=>c.原始值).map(([a,c])=>[a,{原始值:c.原始值,值类型:c.值类型}])),行数:s.行数,列数:s.列数}));
      window.large=()=>{let s=创建工作表('合成旧专属大表',44,16384);s=写入单元格(s,'XFD39','合成远端标识');s=写入单元格(s,'A1','合成冻结标题');s.合并区域=['A1:C2'];s.冻结={行:2,列:1};s.视图={缩放:70};flushSync(()=>store.createDoc('table',[s],{名称:'合成旧范围.slxls'}));};
      window.filter=()=>{let s=创建工作表('合成筛选',400,100);s=写入单元格(s,'A1','合成标题');for(let r=2;r<=400;r++)s=写入单元格(s,'A'+r,r%2?'保留':'排除');s.筛选={列:0,值:'保留'};s.冻结={行:1,列:1};flushSync(()=>store.createDoc('table',[s],{名称:'合成筛选.slxls'}));};
    `
    await require('esbuild').build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser', loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"verification"' }, outfile: path.join(output,'audit.js'), plugins:[{name:'验收不加载文字处理工作线程',setup(build){build.onResolve({filter:/\?worker&url$/},()=>({path:'worker',namespace:'audit'}));build.onLoad({filter:/.*/,namespace:'audit'},()=>({contents:'export default "unused"'}))}}] })
    report.阶段毫秒.组件打包 = Math.round(performance.now() - mark)
    fs.writeFileSync(path.join(output,'audit.html'), `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root,'renderer/src/styles.css'),'utf8')}html,body,#root{height:100%;margin:0}#root .ant-app{height:100%;display:flex;flex-direction:column}</style><link rel="stylesheet" href="audit.css"><div id="root"></div><script src="audit.js"></script>`)
    win = new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,preload:path.join(output,'preload.cjs')}})
    let rendererErrors=0; win.webContents.on('console-message',(_,level)=>{if(level>=3)rendererErrors++})
    await win.loadFile(path.join(output,'audit.html'))
    const js = code => win.webContents.executeJavaScript(code)
    const frame = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const wait = async predicate => { for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50))}throw new Error('等待界面或保存超时') }
    const navigate = async address => {await js(`change('名称框',${JSON.stringify(address)})`);await frame();await js("press('Enter')");await frame()}
    const uiHash = async () => hash(JSON.stringify(await js('snapshot().map(s=>s.单元格)')))
    const open = async p => {check('实际文件打开链路',await js(`openSource(${JSON.stringify(p)})`));await frame()}
    stage = '真实打开与布局'; mark=performance.now();await open(source)
    report.阶段毫秒.打开至双帧 = Math.round(performance.now()-mark)
    let facts=await js('facts()');report.初始结构=facts
    if(process.argv.includes('--screenshots')) fs.writeFileSync(path.join(output,'source-open.png'),(await win.webContents.capturePage()).toPNG())
    check('工作表范围紧凑', facts.行数<=50 && facts.列数<=26)
    check('来源缩放恢复70', facts.缩放===70 && Number(facts.实际缩放)===0.7)
    check('直接打开无转换风险弹窗', facts.导入提示数===0 && facts.弹窗数===0)
    check('挂载格数有界', facts.挂载格数>0 && facts.挂载格数<=2500,{数量:facts.挂载格数})
    const beforeSnapshot=await js('snapshot()'), beforeUI=await uiHash()
    stage = '真实选择滚动与副本编辑';mark=performance.now();await navigate('R39')
    let visible=await js(`(()=>{const g=document.querySelector('.wps-sheet'),c=g.querySelector('[data-地址="R39"]');if(!c)return false;const a=g.getBoundingClientRect(),b=c.getBoundingClientRect();return b.right>a.left&&b.left<a.right&&b.bottom>a.top&&b.top<a.bottom})()`)
    check('名称框选择滚动到原有末格',visible,{毫秒:Math.round(performance.now()-mark)})
    const target='T41'
    check('副本测试格不覆盖原有数据',!beforeSnapshot[0].单元格[target])
    await navigate(target);await js(`change('公式栏','合成新增验收值')`);await frame();await js("press('Enter')");await frame()
    const edited=await js('snapshot()')
    check('公式栏真实编辑已提交',edited[0].单元格[target]?.原始值==='合成新增验收值')
    delete edited[0].单元格[target]
    check('原始各表单元格与公式未改',hash(JSON.stringify(edited.map(s=>s.单元格)))===beforeUI)
    const expected=await uiHash();const ranges=[]
    for(const ext of ['xlsx','slxls'])for(let cycle=1;cycle<=3;cycle++){
      stage=`副本保存重开${ext}${cycle}`
      savePath=path.join(output,`copy-${ext}-${cycle}.${ext}`);const old=saves;mark=performance.now()
      await js(`document.querySelector('.wps-sheet').focus();document.querySelector('.wps-sheet').dispatchEvent(new KeyboardEvent('keydown',{key:'S',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`)
      await wait(()=>Promise.resolve(saves>old));await frame();await open(savePath)
      check('副本保存重开数据完全一致',await uiHash()===expected,{格式:ext,轮次:cycle,毫秒:Math.round(performance.now()-mark)})
      facts=await js('facts()');ranges.push({格式:ext,轮次:cycle,行数:facts.行数,列数:facts.列数})
      check('重复保存范围不增长',facts.行数<=50&&facts.列数<=26)
      if(ext==='xlsx'){
        const saved=new ExcelJS.Workbook();await saved.xlsx.load(fs.readFileSync(savePath))
        saved.worksheets[0].getCell(target).value=null
        check('原件有效内容逐格摘要不变',JSON.stringify(contentHashes(saved))===JSON.stringify(rawHashes))
      }
    }
    report.往返结构=ranges
    stage='旧专属大范围与远端导航';mark=performance.now();await js('large()');await frame();facts=await js('facts()')
    check('旧专属44乘16384范围挂载有界',facts.行数===44&&facts.列数===16384&&facts.挂载格数<=2500,{数量:facts.挂载格数,毫秒:Math.round(performance.now()-mark)})
    await navigate('XFD39');facts=await js('facts()')
    const remote=await js(`(()=>{const g=document.querySelector('.wps-sheet'),c=g.querySelector('[data-地址="XFD39"]');if(!c)return {存在:false};const a=g.getBoundingClientRect(),b=c.getBoundingClientRect();return {存在:true,值一致:c.textContent.includes('合成远端标识'),在视口:b.right>a.left&&b.left<a.right&&b.bottom>a.top&&b.top<a.bottom,右边界:b.right,视口右边界:a.right}})()`)
    check('真实远端单元格可见',remote.存在&&remote.值一致&&remote.在视口,{左偏移:facts.左,滚动宽:facts.滚动宽,挂载格数:facts.挂载格数,右边界:remote.右边界,视口右边界:remote.视口右边界})
    // 70% 缩放下长轨道会累计子像素取整；末格实际命中和万分之二内尺寸共同验收。
    check('完整列轨道未被浏览器截断',Math.abs(facts.滚动宽-(46+16384*88))/(46+16384*88)<=0.0002,{滚动宽:facts.滚动宽})
    await js(`document.querySelector('.wps-sheet').focus();document.querySelector('.wps-sheet').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))`);await frame()
    check('远端键盘导航响应',await js(`document.querySelector('[aria-label="名称框"]').value==='XFC39'`))
    check('冻结行合并锚点保留',await js(`!!document.querySelector('[data-地址="A1"]')&&!document.querySelector('[data-地址="B1"]')`))
    const scrollTimes=[]
    for(let i=0;i<10;i++){
      mark=performance.now();await js(`(()=>{const g=document.querySelector('.wps-sheet');g.scrollLeft=${i%2?1439000:400000};g.dispatchEvent(new Event('scroll'))})()`);await frame()
      scrollTimes.push(Math.round(performance.now()-mark))
      check('滚动更新挂载保持有界',(await js('facts()')).挂载格数<=2500)
    }
    scrollTimes.sort((a,b)=>a-b);report.滚动响应毫秒={次数:10,中位数:scrollTimes[5],最大值:scrollTimes[9]}
    stage='合成筛选回归';await js('filter()');await frame();facts=await js('facts()')
    check('筛选隐藏排除行',await js(`!document.querySelector('[data-地址="A2"]')&&!!document.querySelector('[data-地址="A3"]')`))
    check('合成大表挂载有界',facts.挂载格数<=2500,{数量:facts.挂载格数})
    report.桥接={读取次数:bridgeReads,编码次数:bridgeWrites,落盘次数:saves,浏览器错误数:rendererErrors}
    check('真实编码和保存链路已执行',bridgeReads>=7&&bridgeWrites===6&&saves===6)
    report.通过=true
  } catch(error) {
    // 错误仅留验收阶段和自定义检查名，禁止转储数据或浏览器内容。
    report.失败阶段=stage
    report.错误=error?.message&&report.检查.some(x=>x.项目===error.message)?error.message:'执行异常，需本机定位'
  } finally {
    if(source&&beforeHash){const after=hash(fs.readFileSync(source));report.原件校验={前SHA256:beforeHash,后SHA256:after,相同:after===beforeHash};if(after!==beforeHash)report.通过=false}
    report.总耗时毫秒=Math.round(performance.now()-start)
    fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify(report))
    win?.destroy();app.exit(report.通过?0:1)
  }
})


