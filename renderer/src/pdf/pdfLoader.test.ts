import { afterEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({getDocument:vi.fn(),factory:vi.fn()}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({getDocument:mocks.getDocument}))
vi.mock('./pdfWorkerFactory',()=>({创建PDF线程:mocks.factory}))
import { 载入PDF } from './pdfLoader'
afterEach(()=>{vi.resetAllMocks()})

it('关闭任务等待销毁完成再释放自身线程，不影响新文档且不会重复释放',async()=>{
  const releases=[vi.fn(),vi.fn()],ports=[{id:1},{id:2}]
  let finish!:()=>void
  const pending=new Promise<void>(resolve=>{finish=resolve})
  mocks.factory.mockReturnValueOnce({options:{worker:ports[0]},release:releases[0]}).mockReturnValueOnce({options:{worker:ports[1]},release:releases[1]})
  const destroy=[vi.fn(()=>pending),vi.fn(async()=>{})]
  mocks.getDocument.mockReturnValueOnce({promise:Promise.resolve({numPages:1}),destroy:destroy[0]}).mockReturnValueOnce({promise:Promise.resolve({numPages:2}),destroy:destroy[1]})
  const first=await 载入PDF(btoa('first')),second=await 载入PDF(btoa('second'))
  expect(mocks.getDocument.mock.calls.map(call=>call[0].worker)).toEqual(ports)
  first.关闭();first.关闭()
  expect(destroy[0]).toHaveBeenCalledOnce();expect(destroy[1]).not.toHaveBeenCalled();expect(releases[0]).not.toHaveBeenCalled()
  finish();await pending;await new Promise(resolve=>setTimeout(resolve,0))
  expect(releases[0]).toHaveBeenCalledOnce();expect(releases[1]).not.toHaveBeenCalled()
  second.关闭();await new Promise(resolve=>setTimeout(resolve,0));expect(releases[1]).toHaveBeenCalledOnce()
})
it('文档格式错误也释放独立线程，不留下供下个文档误用的全局端口',async()=>{
  const release=vi.fn()
  mocks.factory.mockReturnValue({options:{worker:{}},release})
  mocks.getDocument.mockImplementation(()=>{throw new Error('bad PDF')})
  await expect(载入PDF(btoa('broken'))).rejects.toThrow('bad PDF')
  await new Promise(resolve=>setTimeout(resolve,0));expect(release).toHaveBeenCalledOnce()
})
