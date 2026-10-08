import {Input} from 'antd'
import {cloudCall} from './CloudProvider'
export function reportPublic(modal:any,message:any,id:string){
  let reason=''
  modal.confirm({title:'举报公开内容',content:<><p>请说明侵权、错误或其他问题。仅发送举报理由和公开内容标识。</p><Input.TextArea aria-label="举报理由" maxLength={500} onChange={e=>reason=e.target.value}/></>,okText:'提交举报',onOk:async()=>{if(!reason.trim())throw new Error('请填写举报理由');await cloudCall('report',{id,reason:reason.trim()});message.success('举报已提交，管理员将在操作记录中处理')}})
}
