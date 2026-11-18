/**
 * 请求层单元测试:业务码处理、429 限流自动重试(只重试查询、只重试一次)。
 * 用 axios 的 adapter 选项模拟服务端,不发真实请求。
 * Author: qiufeng
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

vi.mock('tdesign-vue-next', () => ({
  MessagePlugin: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

const { request } = await import('@/utils/request');
const { MessagePlugin } = await import('tdesign-vue-next');

/** 按顺序返回预设响应的假服务端;记录收到的请求次数 */
function fakeServer(responses: Array<{ status: number; body: unknown }>) {
  let calls = 0;
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const { status, body } = responses[Math.min(calls, responses.length - 1)]!;
    calls++;
    const response = { data: body, status, statusText: '', headers: {}, config } as AxiosResponse;
    if (status >= 400) {
      throw new AxiosError('failed', String(status), config, null, response);
    }
    return response;
  };
  return { adapter, calls: () => calls };
}

const ok = (data: unknown) => ({ status: 200, body: { code: 0, message: 'ok', data } });
const limited = { status: 429, body: { code: 42900, message: '请求过于频繁,请稍后再试', data: [] } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('request', () => {
  it('业务码 0 时返回 data', async () => {
    const server = fakeServer([ok({ id: 1 })]);
    await expect(request({ url: '/x', adapter: server.adapter })).resolves.toEqual({ id: 1 });
  });

  it('业务码非 0 时弹出提示并 reject', async () => {
    const server = fakeServer([{ status: 200, body: { code: 40000, message: '参数错误', data: [] } }]);
    await expect(request({ url: '/x', adapter: server.adapter })).rejects.toMatchObject({ code: 40000 });
    expect(MessagePlugin.error).toHaveBeenCalledWith('参数错误');
  });

  it('GET 被限流时等一秒自动重试,成功后不弹错误', async () => {
    const server = fakeServer([limited, ok('second try')]);
    const pending = request({ url: '/x', method: 'GET', adapter: server.adapter });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe('second try');
    expect(server.calls()).toBe(2);
    expect(MessagePlugin.error).not.toHaveBeenCalled();
  });

  it('GET 只重试一次,第二次还被限流就报错', async () => {
    const server = fakeServer([limited, limited, ok('never')]);
    const pending = request({ url: '/x', method: 'GET', adapter: server.adapter });
    const assertion = expect(pending).rejects.toMatchObject({ code: 42900 });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(server.calls()).toBe(2);
    expect(MessagePlugin.error).toHaveBeenCalledWith('请求过于频繁,请稍后再试');
  });

  it('POST 被限流不自动重试,避免重复提交', async () => {
    const server = fakeServer([limited, ok('never')]);
    await expect(request({ url: '/x', method: 'POST', adapter: server.adapter })).rejects.toMatchObject({ code: 42900 });
    expect(server.calls()).toBe(1);
  });
});
