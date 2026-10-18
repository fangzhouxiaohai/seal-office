/** Open the existing parameter menu; keep its selection capture and command validation. */
export function openRibbonCommand(command: string): boolean {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>('[data-seal-command-menus]'))
  const tab = tabs.find(element => element.dataset.sealCommandMenus?.split(' ').includes(command))
  if (!tab) return false
  const open = () => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-seal-command-menu]')).find(element => element.dataset.sealCommandMenu === command && !element.disabled)
    button?.click()
  }
  if (tab.getAttribute('aria-selected') === 'true') open()
  else { tab.click(); requestAnimationFrame(open) }
  return true
}
