// SSH 暂存端：只新建候选和合并旧资源，不切换正在运行的服务。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const {snapshot,mergeLegacyAssets,assertLegacyAssets}=require('./tpadmin-production.cjs')
const {validateTargets}=require('./tpadmin-production-runner.cjs')
const SITE='/www/wwwroot/seal.xingmasoft.com'
function run(input, options={}) {
  const validate=options.validate||validateTargets,site=options.site||SITE
  validate(input)
  if(input.phase==='preflight'){
    const admin=fs.lstatSync(input.items.admin.active);if(!admin.isDirectory()||admin.isSymbolicLink())throw Error('现有后台目录无效')
    const base=Object.fromEntries(Object.entries(input.items).map(([name,item])=>[name,snapshot(item.active)]))
    for(const item of Object.values(input.items))if(fs.existsSync(item.candidate)||fs.existsSync(item.active+'.previous-'+input.id))throw Error('候选或备份已存在')
    const phpParent=site+'/seal-admin-php'
    if(fs.existsSync(phpParent)){const st=fs.lstatSync(phpParent);if(!st.isDirectory()||st.isSymbolicLink())throw Error('PHP 专用目录无效')}
    else fs.mkdirSync(phpParent,{mode:0o755})
    return {passed:true,baseline:base}
  }
  if(input.phase==='finalize'){
    for(const [name,item] of Object.entries(input.items))if(snapshot(item.active)!==input.baseline[name])throw Error('正式目标在暂存期间发生变化')
    const expected=new Map();for(const item of input.expectedFiles){const filename=path.resolve(item.path);if(!Object.values(input.items).some(i=>filename.startsWith(i.candidate+path.sep)||filename===i.candidate)||expected.has(filename))throw Error('冻结文件路径无效');expected.set(filename,item.sha256)}
    const actualFiles=[];function collect(file){const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('候选含符号链接');if(stat.isDirectory())for(const child of fs.readdirSync(file))collect(path.join(file,child));else if(stat.isFile())actualFiles.push(file);else throw Error('候选文件类型无效')}
    for(const item of Object.values(input.items))collect(item.candidate)
    if(actualFiles.length!==expected.size||actualFiles.some(file=>!expected.has(file)))throw Error('候选文件与清单不一致')
    for(const filename of actualFiles){const actual=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');if(actual!==expected.get(filename))throw Error('上传候选摘要不一致')}
    const oldRoot=path.join(input.items.admin.active,'assets'),newRoot=path.join(input.items.admin.candidate,'assets')
    const merge=mergeLegacyAssets(oldRoot,newRoot);const count=assertLegacyAssets(oldRoot,newRoot)
    if(snapshot(input.items.admin.active)!==input.baseline.admin)throw Error('原后台资源在暂存期间发生变化')
    return {passed:true,baseline:input.baseline,frozen:Object.fromEntries(Object.entries(input.items).map(([name,item])=>[name,snapshot(item.candidate)])),legacy:count,merge}
  }
  throw Error('暂存阶段无效')
}
if(require.main===module){let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>value+=part);process.stdin.on('end',()=>{try{console.log(JSON.stringify(run(JSON.parse(value))))}catch(error){console.error('暂存失败：'+error.message);process.exitCode=1}})}
module.exports={run}
