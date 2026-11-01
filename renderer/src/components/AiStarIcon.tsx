import { useId } from 'react'

/** AI 功能统一图标：多彩渐变四角星（主星 + 小星），在浅色与深色界面下都清晰可辨。 */
export default function AiStarIcon({ size = 14, className }: { size?: number; className?: string }) {
  const 标识 = useId().replace(/:/g, '')
  return <svg className={className} data-testid="ai-star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`seal-ai-star-${标识}`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FF5A5F" />
        <stop offset=".22" stopColor="#FF9F1C" />
        <stop offset=".42" stopColor="#FFD60A" />
        <stop offset=".6" stopColor="#2EC4B6" />
        <stop offset=".8" stopColor="#3A86FF" />
        <stop offset="1" stopColor="#8E5BF6" />
      </linearGradient>
    </defs>
    <path fill={`url(#seal-ai-star-${标识})`} d="M10 2.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5Z" />
    <path fill={`url(#seal-ai-star-${标识})`} d="M18 13c.3 2.2 1.5 3.4 3.7 3.7-2.2.3-3.4 1.5-3.7 3.7-.3-2.2-1.5-3.4-3.7-3.7 2.2-.3 3.4-1.5 3.7-3.7Z" />
    <circle cx="5" cy="19" r="1.4" fill="#3A86FF" />
  </svg>
}
