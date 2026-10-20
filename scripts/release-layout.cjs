// Generated release directories only; reject links and unknown paths before deletion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),version=require('../package.json').version
if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))throw new Error('Invalid project version')
const release=path.join(root,'release'),current=path.join(release,'v'+version)
fs.mkdirSync(release,{recursive:true});fs.mkdirSync(current,{recursive:true});fs.mkdirSync(path.join(release,'promo'),{recursive:true})
const verify=target=>{const resolved=path.resolve(target);if(!resolved.startsWith(release+path.sep)||fs.realpathSync(resolved)!==resolved||fs.lstatSync(resolved).isSymbolicLink())throw new Error('Unsafe release path: '+target);return resolved}
verify(current);verify(release+'/promo')
const prune=process.argv.includes('--prune'),removed=[],moved=[]
for(const item of fs.readdirSync(release,{withFileTypes:true})){
  if(item.name==='v'+version||item.name==='promo')continue
  const source=verify(path.join(release,item.name))
  if(item.isDirectory()&&(/^(?:v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?|ubuntu|win-unpacked|linux-unpacked|web-\d[^/]*|msix-[^/]+)$/.test(item.name))){if(!prune)throw new Error('Run npm run release:prepare to remove old generated releases');fs.rmSync(source,{recursive:true});removed.push(item.name);continue}
  if(item.isFile()&&item.name.startsWith('seal-office-')&&item.name.includes(version)&&/\.(?:exe|msix|deb|zip|apk|hap|app|blockmap)$/.test(item.name)){
    const destination=path.join(current,item.name),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if(fs.existsSync(destination)){if(sha(source)!==sha(verify(destination)))throw new Error('Conflicting release artifact');if(prune)fs.unlinkSync(source)}else fs.renameSync(source,destination)
    moved.push(item.name);continue
  }
  throw new Error('Unexpected release root entry; inspect before removing: '+item.name)
}
console.log(JSON.stringify({version,current,removed,moved,rootEntries:fs.readdirSync(release)}))
