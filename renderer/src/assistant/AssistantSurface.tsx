import { useEffect, useState, type ReactNode } from 'react'
import { Drawer, Modal } from 'antd'

export default function AssistantSurface({ mobile, open, onClose, title, children }: { mobile: boolean; open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const [top, setTop] = useState(0)
  useEffect(() => {
    if (!mobile || !open) return
    const update = () => setTop(window.visualViewport?.offsetTop ?? 0)
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [mobile, open])
  if (!mobile) return <Drawer className="assistant-drawer" title={title} placement="right" width="min(460px, 100vw)" mask={false} closable={false} open={open} onClose={onClose} destroyOnClose={false}>{children}</Drawer>
  return <Modal className="assistant-mobile-modal" wrapClassName="assistant-mobile-modal-wrap" title={title}
    open={open} onCancel={onClose} footer={null} width="min(720px, calc(100vw - 24px))"
    style={{ top: `calc(${top}px + env(safe-area-inset-top, 0px) + 8px)` }}
    closeIcon={<span aria-label="关闭智能助手">×</span>} maskClosable={false} destroyOnClose={false}>
    {children}
  </Modal>
}
