const { randomBytes, createCipheriv, createDecipheriv, hkdfSync } = require('crypto')
function seal(key, data, context) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted=Buffer.concat([cipher.update(data),cipher.final()])
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted])
}
function unseal(key,data,context) {
  if(data.length<28)throw new Error('加密文件不完整')
  const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12))
  cipher.setAAD(Buffer.from(context));cipher.setAuthTag(data.subarray(12,28))
  try{return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()])}catch{throw new Error('恢复密钥不正确或加密文件已损坏')}
}
const recoveryKey=(value,user)=>{
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value.replace(/[-\s]/g,'')))throw new Error('恢复密钥格式不正确')
  return Buffer.from(hkdfSync('sha256',Buffer.from(value.replace(/[-\s]/g,''),'hex'),Buffer.from(user),Buffer.from('seal-recovery-v1'),32))
}
module.exports={seal,unseal,recoveryKey}
