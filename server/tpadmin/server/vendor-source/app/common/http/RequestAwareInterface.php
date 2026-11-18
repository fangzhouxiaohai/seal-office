<?php

namespace app\common\http;

/**
 * 控制器实现该接口后,Router 分发前自动注入当前 Request,
 * 控制器方法无需再声明 Request $request 参数。
 * Author: qiufeng
 */
interface RequestAwareInterface
{
    public function setRequest(Request $request): void;
}
