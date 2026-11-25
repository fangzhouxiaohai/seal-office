const fs=require('node:fs'),path=require('node:path')
// 源码仓库与独立服务发布根共用同一份格式清单。
const file=[path.join(__dirname,'../main/documentFormats.json'),path.join(__dirname,'documentFormats.json')].find(file=>fs.existsSync(file))
if(!file)throw new Error('文档格式清单缺失，服务发布不完整')
module.exports=JSON.parse(fs.readFileSync(file,'utf8'))
