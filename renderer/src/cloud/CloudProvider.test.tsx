import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {App} from 'antd'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {CloudProvider,useCloud} from './CloudProvider'
function OpenAccount(){const cloud=useCloud();return <button onClick={cloud.configure}>账号测试入口</button>}
const originalApi=window.electronAPI
afterEach(()=>{window.electronAPI=originalApi})
describe('固定云服务的账号界面',()=>{
  it('保留手机验证码登录，不展示地址与连接设置',async()=>{
    render(<App><CloudProvider><OpenAccount/></CloudProvider></App>)
    fireEvent.click(screen.getByText('账号测试入口'))
    expect(await screen.findByLabelText('手机号')).toBeInTheDocument()
    expect(screen.getByLabelText('验证码')).toBeInTheDocument()
    expect(screen.queryByLabelText('云服务器地址')).not.toBeInTheDocument()
    expect(screen.queryByText('连接服务')).not.toBeInTheDocument()
    expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument()
  })
  it('手机号无效时阻止提交，输入有效手机号和验证码后支持表单提交',async()=>{
    const invoke=vi.fn(async()=>({成功:true,数据:{account:null,unlocked:false,statuses:{},pending:0}}))
    window.electronAPI={cloud:{invoke}} as any
    render(<App><CloudProvider><OpenAccount/></CloudProvider></App>)
    fireEvent.click(screen.getByText('账号测试入口'))
    const phone=await screen.findByLabelText('手机号'),code=screen.getByLabelText('验证码'),form=screen.getByRole('form',{name:'手机验证码登录'})
    expect(phone).toHaveAttribute('type','tel')
    expect(code).toHaveAttribute('autocomplete','one-time-code')
    fireEvent.change(phone,{target:{value:'123'}})
    fireEvent.change(code,{target:{value:'123456'}})
    fireEvent.submit(form)
    expect(invoke.mock.calls.some((call:any)=>call[0]==='login')).toBe(false)
    fireEvent.change(phone,{target:{value:'13800138000'}})
    expect(code).toHaveValue('')
    fireEvent.change(code,{target:{value:'123456'}})
    fireEvent.submit(form)
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith('login',{phone:'13800138000',code:'123456'}))
  })
  it('验证码请求失败可原地重试，请求中的重复操作只提交一次',async()=>{
    let rejectCode=true,finish:(value:any)=>void=()=>{}
    const invoke=vi.fn(async(action:string)=>{
      if(action==='status')return {成功:true,数据:{account:null,unlocked:false,statuses:{},pending:0}}
      if(rejectCode)return {成功:false,错误:'短信服务暂时不可用，请稍后重试'}
      return new Promise(resolve=>{finish=resolve})
    })
    window.electronAPI={cloud:{invoke}} as any
    render(<App><CloudProvider><OpenAccount/></CloudProvider></App>)
    fireEvent.click(screen.getByText('账号测试入口'))
    fireEvent.change(await screen.findByLabelText('手机号'),{target:{value:'13800138000'}})
    fireEvent.click(screen.getByRole('button',{name:'获取验证码'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('短信服务暂时不可用')
    expect(screen.getByLabelText('手机号')).toHaveValue('13800138000')
    rejectCode=false
    fireEvent.click(screen.getByRole('button',{name:'获取验证码'}))
    fireEvent.click(screen.getByRole('button',{name:'获取验证码'}))
    expect(invoke.mock.calls.filter(call=>call[0]==='code')).toHaveLength(2)
    finish({成功:true})
    await waitFor(()=>expect(screen.getByRole('button',{name:'60 秒后重试'})).toBeDisabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
