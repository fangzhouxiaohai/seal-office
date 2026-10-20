const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..'),formats=require('../main/documentFormats.json')
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const target=path.join(root,'main/windows/shellIntegration.ps1')
const declarations={
  taskSupported:'@('+formats.map(item=>quote(item.extension)).join(',')+')',
  taskLabels:'@{'+formats.map(item=>item.extension+'='+quote(item.label)).join(';')+'}',
  taskIcons:'@{'+formats.map(item=>item.extension+'='+quote((item.icon==='presentation'?'ppt':item.icon)+'.ico')).join(';')+'}'
}
let source=fs.readFileSync(target,'utf8')
for(const [name,value]of Object.entries(declarations)){
  const pattern=new RegExp('^\\$'+name+' = [^\\r\\n]+','m')
  if(!pattern.test(source))throw new Error('Missing Windows document declaration: '+name)
  source=source.replace(pattern,()=>'$'+name+' = '+value)
}
// Windows PowerShell 5.1 decodes non-BOM scripts through the system code page.
fs.writeFileSync(target,'\uFEFF'+source.replace(/^\uFEFF/,''),'utf8')
console.log('Windows document associations synchronized from documentFormats.json')
