# HarmonyOS 打开、保存和登录无响应修复

用户提供的两段审核录屏分别显示：获取验证码后长期等待，以及首页打开文件、底部文件入口和编辑器打开/保存/另存为没有响应。录屏不能提供宿主异常堆栈，因此以下结论区分静态证据、隔离回归与真实设备验收。

## 证据与原因

对原签名 App Pack 只读检查，SHA-256 为 `9b505f596e79b43b20ceacebd525cd58a9bc92ad48f5363bfcc9537aa6ed0703`，未重写原包。REA 归档摘要 Evidence 为 `ev_8a70dce969571158defa560c3586b4452e0cb3ccfad1cb4c1ae9a05788c784bf`。

签名包实际 `workspace.js` 的 `onMessage` 对每项消息直接调用 `getString()` 等 UTSJSONObject 实例方法。实际 Harmony SDK 的 WebView 组件把 `JSON.parse(data).data` 作为普通 JavaScript 对象发出；组件派发回调时捕获了异常。普通对象没有上述实例方法，这条公共分发通道会在处理打开、保存和 HTTP 请求前抛错。隔离 SDK 形状回归可以复现这个错误；它与录屏表现一致，但尚无审核设备日志证明这是设备上的唯一原因。

## 修复

- 使用经过类型检查的索引读取，兼容普通对象和 Android 的 UTSJSONObject；保留本地入口、token、请求 id、HTTPS 和尺寸检查。
- 启动增加 `ping → ready` 往返验证。仅注入配置对象不足以判定桥接成功；失败显示可重试错误。
- 分发、系统文件选择器和导出启动时的同步异常返回明确错误。取消不报告保存成功，Harmony 目标 URI 写入并关闭后才返回成功。
- 普通原生 HTTP 请求有 60 秒超时，网页端有 70 秒兜底并中止宿主请求；SSE 根据活动续期。超时、断网、错误和迟到回包都清理等待状态，不会永久锁住登录按钮。
- 系统选择器使用全文件选择后按统一格式表核验，覆盖 `.sldoc/.slxls/.slppt/.spdf` 和旧三后缀，避免自定义 MIME 未被系统识别时文件不可选。

## 复验范围

`mobile/tests/native-host-contract.test.mjs` 运行项目实际 `uni.webview.js`，经 SDK 形状的 JSON 消息进入编译宿主，使用隔离选择器、文件系统和 HTTP 适配器。测试核对七种新旧格式的导入、导出 MIME 和目标字节，包含非法消息、系统异常和错误返回。短信请求只向测试适配器提交无效号码，没有发送真实短信。

Android 和 Harmony UTS 编译检查通过。最终生产 IIFE、包内双字体与许可证、浏览器模拟宿主和实际设备结果须分别记录于本版验收报告。源码 ZIP 是云打包输入，不是已签名 APK、HAP 或 App Pack。

本次排查时 `hdc list targets` 返回 `[Empty]`。没有连接 HarmonyOS 6.1 审核设备，因此系统选择器、DocumentViewPicker 保存后冷启动重开以及运营商短信实际到达需要用新版云打包成品在设备验证后再提交商店。原有签名包仍是旧代码，不能复用旧包来验证本次修复。

相关官方支持表：[文件选择](https://doc.dcloud.net.cn/uni-app-x/api/choose-file.html)、[文件系统](https://doc.dcloud.net.cn/uni-app-x/api/get-file-system-manager.html)、[WebView 上下文](https://doc.dcloud.net.cn/uni-app-x/api/create-webview-context.html)、[网络请求](https://doc.dcloud.net.cn/uni-app-x/api/request.html)。
