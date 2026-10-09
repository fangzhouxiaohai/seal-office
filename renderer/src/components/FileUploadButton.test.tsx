import { render,screen,fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect,it,vi } from 'vitest'
import FileUploadButton from './FileUploadButton'

it('上传入口支持键盘、禁用状态，并在选择文件前执行授权检查', async()=>{
  let allowed=false
  const choose=vi.fn(()=>allowed),change=vi.fn()
  const {container,rerender}=render(<FileUploadButton onBeforeChoose={choose} onChange={change} accept=".docx">上传知识文件</FileUploadButton>)
  const input=container.querySelector('input')!,click=vi.spyOn(input,'click')
  const button=screen.getByRole('button',{name:'上传知识文件'})
  button.focus();await userEvent.keyboard('{Enter}')
  expect(choose).toHaveBeenCalledOnce();expect(click).not.toHaveBeenCalled()
  allowed=true;await userEvent.keyboard(' ');expect(click).toHaveBeenCalledOnce()
  fireEvent.change(input,{target:{files:[new File(['正文'],'资料.docx')]}});expect(change).toHaveBeenCalledOnce()
  rerender(<FileUploadButton disabled onBeforeChoose={choose} onChange={change}>上传知识文件</FileUploadButton>)
  await userEvent.click(button);expect(click).toHaveBeenCalledOnce();expect(button).toBeDisabled()
})
