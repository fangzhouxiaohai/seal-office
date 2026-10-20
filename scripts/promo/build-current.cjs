const path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..')
const fs=require('node:fs'),version=require('../../package.json').version,output=path.join(root,'release/promo')
fs.mkdirSync(output,{recursive:true})
if(fs.realpathSync(output)!==output)throw new Error('Promotional directory must stay inside this project')
for(const item of fs.readdirSync(output,{withFileTypes:true})){
  if(item.name.includes(version))continue
  const target=path.join(output,item.name)
  if(fs.realpathSync(target)!==target||fs.lstatSync(target).isSymbolicLink())throw new Error('Unsafe promotional cleanup path')
  fs.rmSync(target,{recursive:item.isDirectory(),force:true})
}
for(const [program,args]of [[require('electron'),[path.join(__dirname,'current-capture.cjs')]],['python',[path.join(__dirname,'current-video.py')]]]){
  const result=spawnSync(program,args,{cwd:root,stdio:'inherit',shell:false,windowsHide:true})
  if(result.status!==0){console.error('Current promotional build failed:',result.error?.message||result.signal||result.status);process.exit(result.status||1)}
}
