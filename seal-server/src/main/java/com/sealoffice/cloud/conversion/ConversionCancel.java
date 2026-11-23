package com.sealoffice.cloud.conversion;

import com.sealoffice.cloud.common.ApiException;

import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 转换取消信号：对应 Node accountConversion.cjs 的 AbortController。
 * 超时、会话撤销、客户端断开均经 abort 携带具体中文错误传播到工作进程调用。
 */
public final class ConversionCancel {

    private final List<CompletableFuture<?>> bound = new CopyOnWriteArrayList<>();
    private volatile ApiException reason;

    /** 首次 abort 生效；已绑定的异步请求全部取消。 */
    public void abort(ApiException cause) {
        if (reason != null) {
            return;
        }
        synchronized (this) {
            if (reason != null) {
                return;
            }
            reason = cause;
        }
        for (CompletableFuture<?> future : bound) {
            future.cancel(true);
        }
    }

    /** 绑定一个进行中的 HTTP 交换；若已取消则立即取消它。 */
    public void bind(CompletableFuture<?> future) {
        ApiException current = reason;
        if (current != null) {
            future.cancel(true);
            return;
        }
        bound.add(future);
        if (reason != null) {
            future.cancel(true);
        }
    }

    public boolean aborted() {
        return reason != null;
    }

    /** 取消原因；未指定时回退为 499（客户端断开）。 */
    public ApiException reason() {
        ApiException current = reason;
        return current != null ? current : ApiException.of(499, "文档转换已取消");
    }

    /** 等待 future 完成；被取消时抛出取消原因。 */
    public <T> T join(CompletableFuture<T> future) {
        bind(future);
        try {
            return future.get();
        } catch (CancellationException cancelled) {
            throw reason();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw reason();
        } catch (java.util.concurrent.ExecutionException error) {
            Throwable cause = error.getCause();
            if (aborted()) {
                throw reason();
            }
            if (cause instanceof java.net.http.HttpConnectTimeoutException) {
                throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
            }
            if (cause instanceof java.net.http.HttpTimeoutException) {
                throw ApiException.of(504, "文档转换服务响应超时");
            }
            throw ApiException.of(503, "转换引擎服务未连接，请检查运行状态");
        }
    }
}
