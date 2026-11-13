import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadRelease } from './sealApi';

class FakeUpload {
  static instances: FakeUpload[] = [];
  upload: { onprogress?: (event: {lengthComputable: boolean; loaded: number; total: number}) => void } = {};
  timeout = 0; status = 200; responseText = '';
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void; onloadend?: () => void;
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn();
  constructor() { FakeUpload.instances.push(this); }
  abort() { this.onabort?.(); this.onloadend?.(); }
}
describe('安装包原流上传', () => {
  beforeEach(() => { sessionStorage.clear(); sessionStorage.setItem('seal-admin-token', 'issued'); FakeUpload.instances = []; vi.stubGlobal('XMLHttpRequest', FakeUpload); });
  afterEach(() => vi.unstubAllGlobals());
  it('上传使用原接口和令牌、报告进度并可取消', async () => {
    const controller = new AbortController(), progress = vi.fn(), file = new File(['data'], 'seal-office-2.7.2-macos.dmg');
    const result = uploadRelease('macos', '2.7.2', file, progress, controller.signal);
    const req = FakeUpload.instances[0]!;
    expect(req.open).toHaveBeenCalledWith('POST', expect.stringMatching(/^\/api\/v1\/admin\/release-assets\?/));
    expect(req.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer issued');
    expect(req.timeout).toBe(1800000);
    expect(req.send).toHaveBeenCalledWith(file);
    req.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    expect(progress).toHaveBeenCalledWith(50);
    controller.abort();
    await expect(result).rejects.toThrow('安装包上传已取消');
  });
  it('网络中断显示明确错误', async () => {
    const result = uploadRelease('android', '2.7.2', new File(['x'], 'x.apk'), () => {}, new AbortController().signal);
    FakeUpload.instances[0]!.onerror?.();
    await expect(result).rejects.toThrow('上传连接中断');
  });
  it('请求超时显示明确错误', async () => {
    const result = uploadRelease('android', '2.7.2', new File(['x'], 'x.apk'), () => {}, new AbortController().signal);
    FakeUpload.instances[0]!.ontimeout?.();
    await expect(result).rejects.toThrow('上传超时');
  });
  it('响应返回前会话改变时不能使用旧附件结果', async () => {
    const result = uploadRelease('android', '2.7.2', new File(['x'], 'x.apk'), () => {}, new AbortController().signal);
    const req = FakeUpload.instances[0]!;
    sessionStorage.setItem('seal-admin-token', 'new-token');
    req.responseText = JSON.stringify({ item: { id: 'asset' } }); req.onload?.();
    await expect(result).rejects.toThrow('管理员会话已变更');
  });
});
