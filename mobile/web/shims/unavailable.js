export function request() { throw new Error('当前功能需要平台适配，请使用应用支持的文件和联网接口') }
export const homedir = () => '/seal'
export const tmpdir = () => '/seal/tmp'
export default { request, homedir, tmpdir }
