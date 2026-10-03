// 关于对话框沿用工作台主题，程序信息集中展示。
import { Button, Modal } from 'antd'
import SealLogo from './SealLogo'
import './aboutDialog.css'

interface Props {
  打开状态?: boolean
  关闭回调?: () => void
}

const 信息 = {
  名称: '海豹办公',
  英文名称: 'Seal Office',
  版本: __APP_VERSION__,
  作者: '饮风一笑',
  邮箱: '24519660@qq.com',
  说明: '本程序永久免费开源',
  开源地址: 'https://github.com/fangzhouxiaohai/seal-office',
  专业服务: '专业应用开发服务',
}

const AboutDialog = ({ 打开状态 = true, 关闭回调 }: Props) => (
  <Modal
    title="关于海豹办公"
    open={打开状态}
    onCancel={关闭回调}
    footer={<Button onClick={关闭回调}>关闭</Button>}
    width={520}
    styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
  >
    <div className="about-dialog">
      <div className="about-dialog__intro">
        <SealLogo size={60} withBackground={false} />
        <h2>{信息.名称}</h2>
        <p>{信息.英文名称} v{信息.版本}</p>
      </div>
      <dl className="about-dialog__details">
        <div><dt>作者</dt><dd>{信息.作者}</dd></div>
        <div><dt>邮箱</dt><dd><a href={`mailto:${信息.邮箱}`}>{信息.邮箱}</a></dd></div>
        <div><dt>说明</dt><dd>{信息.说明}</dd></div>
        <div><dt>开源地址</dt><dd><a href={信息.开源地址} target="_blank" rel="noopener noreferrer">{信息.开源地址}</a></dd></div>
        <div><dt>专业服务</dt><dd>{信息.专业服务}</dd></div>
      </dl>
      <p className="about-dialog__copyright">2026 年，饮风一笑。本程序永久免费开源。</p>
    </div>
  </Modal>
)

export default AboutDialog
