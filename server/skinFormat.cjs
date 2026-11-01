const fs=require('node:fs'),path=require('node:path')
// 独立服务发布时复制同一份皮肤校验模块，保证客户端与审核端规则一致。
const file=[path.join(__dirname,'../main/skins/skinFormat.js'),path.join(__dirname,'skinFormat.js')].find(file=>fs.existsSync(file))
if(!file)throw new Error('皮肤校验模块缺失，服务发布不完整')
module.exports=require(file)
