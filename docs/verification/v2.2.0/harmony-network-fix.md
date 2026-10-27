# 鸿蒙登录网络错误修复

日期：2026-10-27。

## 现象

Android 可以正常获取验证码，HarmonyOS 点击“获取验证码”后显示：

> 网络连接失败，请检查网络后重试

这不是服务端返回的业务错误，而是 HarmonyOS 原生网络适配层没有把 HTTP 状态码交给 WebView，`nativeFetch` 收到了 `statusCode: 0`，于是按网络失败处理。

## 根因

原来的 `workspace.uvue` 两个平台共用 `uni.request`：

- Android 的 `uni.request` 正常返回 `statusCode / header / data`。
- HarmonyOS 的 `uni.request` 在部分请求形态下进入 `success`，但 `statusCode` 是 `0`；错误被吞掉后，WebView 只能看到状态 0。
- 请求体又统一转成 `ArrayBuffer`。HarmonyOS 适配层对 JSON `ArrayBuffer` 请求体的处理与 Android 不一致，进一步放大了问题。

所以之前只把状态 0 改成中文提示，只是把英文 `Response` 异常藏掉了，并没有修好传输。

## 修复

1. `mobile/web/native.ts`
   - 字符串请求体额外发送 `bodyText`，Harmony 原生层直接用字符串发 JSON/form 请求。
   - 二进制请求仍保留 base64/ArrayBuffer 路径。

2. `mobile/pages/workspace/workspace.uvue`
   - HarmonyOS 改用系统 `@ohos.net.http`，不再经过会丢状态的 `uni.request`。
   - 普通请求：`request()` 直接读取 `responseCode`、`header` 和 `result`。
   - SSE/流式请求：`requestInStream()` + `headersReceive/dataReceive`，保留 AI 流式输出。
   - 网络错误会显示为 `网络请求失败：<系统错误>`，不再统一伪装成状态 0。
   - 页面卸载和 WebView `abort` 会调用 `destroy()`，避免残留请求。

3. 回归
   - `node --test mobile/tests/native-request.test.mjs`：2/2 通过，并新增 `bodyText` 断言。
   - HarmonyOS UTS 编译检查通过。
   - Android UTS 编译检查通过。
   - 移动全量 39 项：38 通过，1 项因缺少私有 BIFF 样本跳过；`native-host-contract` 的 HTTP 短信链改为 mock 系统 `@ohos.net.http` 并验证 429/断网错误。

## 重要：旧安装包不包含修复

此前用户已经打出的：

- `seal-office-2.2.0-android.apk`
- `seal-office-2.2.0-harmony.app`

构建时间早于本修复，鸿蒙登录仍会失败。它们已移到：

`E:\seal-office\.upgrade-private\release-archive\v2.2.0-native-pre-harmony-http-fix\`

必须重新云打包，不能只替换 JS 或只重新签名旧包。

## 重新打包后的验证

1. 用最新 `release/v2.2.0/mobile-web/harmony-cloud-source/` 重新云打包。
2. 安装新 HAP/App Pack，打开登录，输入测试手机号，点击“获取验证码”。
3. 正常应进入验证码倒计时，不再出现“网络连接失败”。
4. 若仍失败，新提示会带上系统错误码，例如：
   - `2300007`：连接服务器失败
   - `2300060` / `2300077`：TLS/CA 证书问题
   - `2300028`：超时
   这时需要按错误码继续查网络/证书，而不是再猜。
5. 用 `hdc hilog` 抓取应用日志时，重点搜索 `seal`、`net`、`http` 和 `23000`。

## 边界

- 本机没有 HarmonyOS 真机/模拟器，无法在本轮直接完成真机点击验证。
- 已完成的验证是：UTS 编译、请求桥接单测、源码资源校验。真实短信发送和运营商到达仍需真机。
- 不要为了绕过证书问题关闭 TLS 校验；那会把登录 token 暴露给中间人。
