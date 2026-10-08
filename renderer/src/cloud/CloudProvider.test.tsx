import {render,screen,fireEvent} from '@testing-library/react'
import {App} from 'antd'
import {describe,it,expect} from 'vitest'
import {CloudProvider,useCloud} from './CloudProvider'
function OpenAccount(){const cloud=useCloud();return <button onClick={cloud.configure}>账号测试入口</button>}
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
})
