function createSms(env) {
  const configured = Boolean(env.ALIYUN_ACCESS_KEY_ID && env.ALIYUN_ACCESS_KEY_SECRET)
  return {
    configured,
    async send(phone, code) {
      if (!configured) throw Object.assign(new Error('短信服务尚未配置，请联系服务管理员'), { status: 503 })
      const Sms = require('@alicloud/dysmsapi20170525')
      const OpenApi = require('@alicloud/openapi-client')
      const client = new Sms.default(new OpenApi.Config({ accessKeyId: env.ALIYUN_ACCESS_KEY_ID, accessKeySecret: env.ALIYUN_ACCESS_KEY_SECRET, endpoint: 'dysmsapi.aliyuncs.com' }))
      const result = await client.sendSms(new Sms.SendSmsRequest({ phoneNumbers: phone, signName: env.SMS_SIGN_NAME || '新疆星之远境智能科技', templateCode: env.SMS_TEMPLATE_CODE || 'SMS_327845389', templateParam: JSON.stringify({ code }) }))
      if (result.body?.code !== 'OK') throw Object.assign(new Error(`短信发送失败（${result.body?.code || '供应商未响应'}），请稍后重试`), { status: 502 })
      return { requestId: result.body.requestId, bizId: result.body.bizId }
    }
  }
}
module.exports = { createSms }
