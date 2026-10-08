// Panshi 前端固定版本及公开许可证；云端业务使用海豹办公独立 API。
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process')
const here=__dirname,commit='72bfab22cee7f80f4e9a6feaf53a45ca492b9e36',checkout=path.join(here,'upstream'),ui=path.join(checkout,'aizuda-panshi-ui')
if(!fs.existsSync(path.join(ui,'package.json'))){execFileSync('git',['clone','https://gitee.com/aizuda/panshi.git',checkout],{stdio:'inherit'});execFileSync('git',['checkout',commit],{cwd:checkout,stdio:'inherit'})}
for(const file of ['main.ts','App.vue'])fs.copyFileSync(path.join(here,'overlay',file),path.join(ui,'src',file))
fs.copyFileSync(path.join(here,'overlay','vite.config.ts'),path.join(ui,'vite.config.ts'))
fs.writeFileSync(path.join(ui,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>海豹办公 · 云端管理</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>')
const command=process.platform==='win32'?'npx.cmd':'npx'
function pnpm(args){execFileSync(command,['--yes','pnpm@10.8.1','--dir',ui,...args],{stdio:'inherit',shell:process.platform==='win32'})}
const lock=path.join(here,'pnpm-lock.yaml')
if(fs.existsSync(lock))fs.copyFileSync(lock,path.join(ui,'pnpm-lock.yaml'))
pnpm(['install',fs.existsSync(lock)?'--frozen-lockfile':'--no-frozen-lockfile','--ignore-scripts','--registry=https://registry.npmjs.org'])
fs.copyFileSync(path.join(ui,'pnpm-lock.yaml'),lock)
pnpm(['build'])
