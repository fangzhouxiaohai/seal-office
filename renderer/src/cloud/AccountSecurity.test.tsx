import { render,screen,fireEvent,waitFor,within } from '@testing-library/react'
import { App } from 'antd'
import { afterEach,it,expect,vi } from 'vitest'
import { AccountSecurity } from './AccountSecurity'
import { CloudProvider,useCloud } from './CloudProvider'
const original=window.electronAPI
afterEach(()=>{window.electronAPI=original})
it('密码登录使用独立提交和自动填充提示，忘记密码可回到短信登录',async()=>{
  const invoke=vi.fn(async()=>({成功:true,数据:{account:null,pending:0,unlocked:false,statuses:{}}}))
  window.electronAPI={cloud:{invoke}} as any
  const Open=()=>{const cloud=useCloud();return <button onClick={cloud.configure}>打开账号测试</button>}
  render(<App><CloudProvider><Open/></CloudProvider></App>)
  fireEvent.click(screen.getByText('打开账号测试'));fireEvent.click(await screen.findByText('密码登录'))
  fireEvent.change(screen.getByLabelText('手机号'),{target:{value:'13800138000'}})
  const password=screen.getByLabelText('登录密码');expect(password).toHaveAttribute('autocomplete','current-password')
  fireEvent.change(password,{target:{value:'用户设置的密码 Password2026'}});fireEvent.submit(screen.getByRole('form',{name:'手机号密码登录'}))
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('loginPassword',{phone:'13800138000',password:'用户设置的密码 Password2026'}))
  fireEvent.click(screen.getByText('忘记密码？使用短信登录后重设'))
  expect(screen.getByLabelText('验证码')).toHaveAttribute('autocomplete','one-time-code')
})
it('注销需要专用验证码、明确的完整确认和后果确认，重复提交只执行一次',async()=>{
  let finish:(value:any)=>void=()=>{}
  const invoke=vi.fn(async(action:string)=>action==='deleteAccount'?new Promise(resolve=>{finish=resolve}):{成功:true,数据:{}}),changed=vi.fn(async()=>{})
  window.electronAPI={cloud:{invoke}} as any
  render(<App><AccountSecurity account={{id:'user',phone:'138****0000',enabled:true,autosave:false,used:0,quota:300000000}} onChanged={changed}/></App>)
  fireEvent.click(screen.getByRole('button',{name:'注销账号'}))
  const form=screen.getByRole('form',{name:'永久注销账号'}),submit=screen.getByRole('button',{name:'永久注销并删除云数据'})
  expect(submit).toBeDisabled();fireEvent.submit(form);expect(invoke).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('验证绑定手机 138****0000'),{target:{value:'123456'}})
  fireEvent.change(screen.getByLabelText('输入“永久注销海豹办公账号”'),{target:{value:'永久注销海豹办公账号'}})
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.submit(form);fireEvent.submit(form)
  expect(invoke.mock.calls.filter(call=>call[0]==='deleteAccount')).toHaveLength(1)
  expect(invoke).toHaveBeenCalledWith('deleteAccount',{code:'123456',confirm:'永久注销海豹办公账号'})
  finish({成功:true,数据:{}});await waitFor(()=>expect(changed).toHaveBeenCalledOnce())
})
it('注销失败在注销表单中反馈并聚焦，手机滚到提交处仍可读到原因',async()=>{
  window.electronAPI={cloud:{invoke:vi.fn(async()=>({成功:false,错误:'验证码不正确'}))}} as any
  render(<App><AccountSecurity account={{id:'user',phone:'138****0000',enabled:true,autosave:false,used:0,quota:300000000}} onChanged={async()=>{}}/></App>)
  fireEvent.click(screen.getByRole('button',{name:'注销账号'}))
  const form=screen.getByRole('form',{name:'永久注销账号'})
  fireEvent.change(within(form).getByLabelText('验证绑定手机 138****0000'),{target:{value:'123456'}})
  fireEvent.change(within(form).getByLabelText('输入“永久注销海豹办公账号”'),{target:{value:'永久注销海豹办公账号'}})
  fireEvent.click(within(form).getByRole('checkbox'));fireEvent.submit(form)
  const alert=await within(form).findByRole('alert');expect(alert).toHaveTextContent('验证码不正确')
  await waitFor(()=>expect(alert).toHaveFocus())
})
