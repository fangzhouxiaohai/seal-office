const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..'),formats=require('../main/documentFormats.json')
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const target=path.join(root,'main/windows/shellIntegration.ps1')
const declarations={
  taskSupported:'@('+formats.map(item=>quote(item.extension)).join(',')+')',
  taskLabels:'@{'+formats.map(item=>item.extension+'='+quote(item.label)).join(';')+'}',
  taskIcons:'@{'+formats.map(item=>item.extension+'='+quote((item.icon==='presentation'?'ppt':item.icon)+'.ico')).join(';')+'}'
}
const original=fs.readFileSync(target,'utf8')
let source=original
for(const [name,value]of Object.entries(declarations)){
  const pattern=new RegExp('^\\$'+name+' = [^\\r\\n]+','m')
  if(!pattern.test(source))throw new Error('Missing Windows document declaration: '+name)
  source=source.replace(pattern,()=>'$'+name+' = '+value)
}
// Windows PowerShell 5.1 decodes non-BOM scripts through the system code page.
const result='\uFEFF'+source.replace(/^\uFEFF/,'')
if(process.argv.includes('--check')) {
  if(original!==result) throw new Error('Windows document associations are stale; run node scripts/sync-document-formats.cjs before building')
  console.log('Windows document associations match documentFormats.json')
} else {
  fs.writeFileSync(target,result,'utf8')
  console.log('Windows document associations synchronized from documentFormats.json')
}
