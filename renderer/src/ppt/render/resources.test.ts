import { afterEach, describe, expect, it, vi } from 'vitest'
import { 恢复导入图片 } from './resources'
import { 创建演示文稿 } from '../deck'
afterEach(()=>{Reflect.deleteProperty(window,'electronAPI')})
const 图片文稿=()=>{ const 文稿=创建演示文稿(),指纹='a'.repeat(64);文稿.资源索引={[指纹]:{指纹,类型:'image/png',字节数:3}};文稿.幻灯片列表[0].对象列表=[{id:'图',类型:'图片',x:0,y:0,width:100,height:50,资源标识:指纹}];return 文稿 }
describe('打开入口资源恢复',()=>{
  it('在返回正文之前恢复经过索引匹配的字节',async()=>{
    const 恢复=vi.fn(async()=>({成功:true})),文稿=图片文稿(),条目=[{标识:'a'.repeat(64),类型:'image/png',数据:'AQID'}]
    Object.defineProperty(window,'electronAPI',{configurable:true,value:{presentationResources:{restore:恢复}}})
    expect(await 恢复导入图片({演示文稿:文稿,资源条目:条目})).toEqual(文稿)
    expect(恢复).toHaveBeenCalledWith(条目)
  })
  it('缺失字节或恢复失败不建立正文，错误原因完整保留',async()=>{
    const 文稿=图片文稿()
    await expect(恢复导入图片({演示文稿:文稿})).rejects.toThrow(/缺少/)
    Object.defineProperty(window,'electronAPI',{configurable:true,value:{presentationResources:{restore:vi.fn(async()=>({成功:false,错误:'图片资源指纹不匹配'}))}}})
    await expect(恢复导入图片({演示文稿:文稿,资源条目:[{标识:'a'.repeat(64),类型:'image/png',数据:'AQID'}]})).rejects.toThrow('图片资源指纹不匹配')
  })
})
