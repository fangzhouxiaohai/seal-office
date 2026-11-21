import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMobileViewfinder } from './useMobileViewfinder'

function 相机(补光 = true) {
  const stopped = vi.fn(), constraints = vi.fn(async () => {})
  const track = Object.assign(new EventTarget(), {
    stop: stopped, readyState: 'live', getCapabilities: () => ({ torch: 补光 }),
    applyConstraints: constraints, getSettings: () => ({ torch: false }),
  })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const acquire = vi.fn(async () => stream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: acquire } })
  const video = document.createElement('video')
  video.play = vi.fn(async () => {})
  video.pause = vi.fn()
  return { track, stream, acquire, stopped, constraints, video }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(window, 'sealPrepareCamera')
})

it('由用户操作启动后置视频，支持设备才使用补光，后台立即释放', async () => {
  const cam = 相机()
  const { result } = renderHook(useMobileViewfinder)
  act(() => result.current.videoRef(cam.video))
  expect(cam.acquire).not.toHaveBeenCalled()
  await act(async () => { expect(await result.current.start()).toBe(true) })
  expect(cam.acquire).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }))
  expect(cam.video.srcObject).toBe(cam.stream)
  await act(async () => { expect(await result.current.toggleTorch()).toBe(true) })
  expect(cam.constraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(cam.stopped).toHaveBeenCalledOnce()
  expect(cam.video.srcObject).toBeNull()
  expect(result.current.status).toBe('idle')
})

it('返回或卸载后才获准的摄像头立即关闭，没有迟到的预览', async () => {
  const cam = 相机()
  let grant!: (stream: typeof cam.stream) => void
  cam.acquire.mockImplementation(() => new Promise<typeof cam.stream>(resolve => { grant = resolve }))
  const { result, unmount } = renderHook(useMobileViewfinder)
  act(() => result.current.videoRef(cam.video))
  let pending!: Promise<boolean>
  await act(async () => { pending = result.current.start() })
  unmount()
  grant(cam.stream)
  expect(await pending).toBe(false)
  expect(cam.stopped).toHaveBeenCalledOnce()
})

it('优先保留摄像头静态照片的分辨率与文件类型，不支持补光时不调用', async () => {
  const cam = 相机(false)
  const take = vi.fn(async () => new Blob(['原片'], { type: 'image/jpeg' }))
  vi.stubGlobal('ImageCapture', class { takePhoto = take })
  const { result } = renderHook(useMobileViewfinder)
  act(() => result.current.videoRef(cam.video))
  await act(async () => { await result.current.start() })
  expect(result.current.torchAvailable).toBe(false)
  expect(await result.current.toggleTorch()).toBe(false)
  const file = await result.current.capture()
  expect(take).toHaveBeenCalledOnce()
  expect(file.type).toBe('image/jpeg')
  expect(file.size).toBe(new Blob(['原片']).size)
})

it('原生权限拒绝后显示中文原因，不再次请求视频流', async () => {
  const cam=相机()
  Object.assign(window, { sealPrepareCamera: () => Promise.reject(new DOMException('camera', 'NotAllowedError')) })
  const { result } = renderHook(useMobileViewfinder)
  act(() => result.current.videoRef(cam.video))
  await act(async () => { expect(await result.current.start()).toBe(false) })
  expect(result.current.status).toBe('denied')
  expect(result.current.error).toMatch(/相机权限/)
  expect(cam.acquire).not.toHaveBeenCalled()
})
