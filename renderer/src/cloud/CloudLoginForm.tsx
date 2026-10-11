import { Button, Input } from 'antd'
import Icon from '../components/Icon'
import logo from '../assets/logo.png'

interface Props {
  phone: string
  code: string
  busy: boolean
  cooldown: number
  error: string
  onPhone: (value: string) => void
  onCode: (value: string) => void
  onSend: () => void
  onLogin: () => void
}

export function CloudLoginForm({ phone, code, busy, cooldown, error, onPhone, onCode, onSend, onLogin }: Props) {
  const validPhone = /^1[3-9]\d{9}$/.test(phone)
  const validCode = /^\d{6}$/.test(code)
  return <div className="seal-login">
    <header className="seal-login__brand">
      <img src={logo} alt="海豹办公程序 Logo" width={64} height={64} />
      <h2>登录海豹办公</h2>
      <p>登录账号，管理你的云端文档</p>
    </header>
    <form className="seal-login__form" aria-label="手机验证码登录" onSubmit={event => {
      event.preventDefault()
      if (validPhone && validCode && !busy) onLogin()
    }}>
      <div className="seal-login__field">
        <label htmlFor="seal-login-phone">手机号</label>
        <Input id="seal-login-phone" name="phone" aria-label="手机号" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="1[3-9][0-9]{9}" maxLength={11} placeholder="请输入 11 位手机号" value={phone} disabled={busy} prefix={<span className="seal-login__dial-code">+86</span>} onChange={event => onPhone(event.target.value.replace(/\D/g, ''))} />
      </div>
      <div className="seal-login__field">
        <label htmlFor="seal-login-code">短信验证码</label>
        <div className="seal-login__code-row">
          <Input id="seal-login-code" name="code" aria-label="验证码" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" required pattern="[0-9]{6}" maxLength={6} placeholder="6 位验证码" value={code} disabled={busy} onChange={event => onCode(event.target.value.replace(/\D/g, ''))} />
          <Button htmlType="button" disabled={cooldown > 0 || busy || !validPhone} onClick={onSend}>{cooldown ? `${cooldown} 秒后重试` : '获取验证码'}</Button>
        </div>
      </div>
      <div className="seal-login__feedback" aria-live="polite">
        {error ? <p className="seal-login__error" role="alert">{error}</p> : <p>{cooldown ? '验证码已发送，请查看手机短信' : '使用短信验证码登录，无需设置密码'}</p>}
      </div>
      <Button className="seal-login__submit" block type="primary" htmlType="submit" loading={busy} disabled={!validPhone || !validCode}>登录</Button>
    </form>
    <div className="seal-login__note"><Icon name="cloud" size={16} /><span>登录后可按需开通加密云空间</span></div>
  </div>
}
