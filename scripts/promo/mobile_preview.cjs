// 只读预览已构建的移动页面，不开放工作区其它文件。
const fs=require('fs'),path=require('path'),http=require('http')
const root=path.resolve(__dirname,'../../mobile/unpackage/web')
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'}
if(!fs.existsSync(path.join(root,'index.html')))throw Error('请先执行 npm run web:build')
const server=http.createServer((req,res)=>{
 try{
  const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'))
  if(!target.startsWith(root+path.sep)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res)
 }catch{res.writeHead(404);res.end()}
})
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'5194 端口已有服务，请复用正确的移动预览或使用 SEAL_TUTORIAL_PORT。':e.message);process.exitCode=1})
const port=Number(process.env.SEAL_TUTORIAL_PORT||5194);server.listen(port,'127.0.0.1',()=>console.log(`移动生产构建预览：http://127.0.0.1:${port}/`))
