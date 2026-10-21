const fs=require('node:fs'),path=require('node:path')
// 独立服务发布时复制同一份主进程编解码器，避免服务端另实现一种容器。
const file=[path.join(__dirname,'../main/office/sealFormat.js'),path.join(__dirname,'nativeSealFormat.cjs')].find(file=>fs.existsSync(file))
if(!file)throw new Error('海豹文档编解码器缺失，服务发布不完整')
module.exports=require(file)
