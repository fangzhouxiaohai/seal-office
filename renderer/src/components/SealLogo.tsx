// 海豹办公品牌标识：圆润可爱的海豹形象。
// 同一造型用于界面顶栏、导出文档署名与打包图标，保证品牌呈现一致。

interface Props {
  size?: number
  className?: string
  /** 是否绘制圆形底色；单色场景下可关闭 */
  withBackground?: boolean
}

const SealLogo = ({ size = 28, className, withBackground = true }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    className={className}
    role="img"
    aria-label="海豹办公"
    focusable="false"
  >
    {withBackground ? (
      <>
        <defs>
          <linearGradient id="sealLogoBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4C86FF" />
            <stop offset="100%" stopColor="#2B6CF6" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill="url(#sealLogoBg)" />
      </>
    ) : null}

    {/* 两只小耳朵 */}
    <circle cx="16" cy="24" r="5" fill="#FFFFFF" />
    <circle cx="48" cy="24" r="5" fill="#FFFFFF" />

    {/* 圆润的头部 */}
    <ellipse cx="32" cy="36" rx="19" ry="17" fill="#FFFFFF" />

    {/* 眼睛与高光 */}
    <circle cx="24.5" cy="32" r="3.4" fill="#1A1D24" />
    <circle cx="39.5" cy="32" r="3.4" fill="#1A1D24" />
    <circle cx="25.6" cy="30.8" r="1.2" fill="#FFFFFF" />
    <circle cx="40.6" cy="30.8" r="1.2" fill="#FFFFFF" />

    {/* 鼻子与微笑 */}
    <ellipse cx="32" cy="39.6" rx="2.8" ry="2.1" fill="#1A1D24" />
    <path
      d="M32 41.7v2.2M32 43.9c-1.5 1.5-3.8 1.5-5 0M32 43.9c1.5 1.5 3.8 1.5 5 0"
      stroke="#1A1D24"
      strokeWidth="1.4"
      strokeLinecap="round"
      fill="none"
    />

    {/* 胡须 */}
    <path
      d="M14 34 6 32.6M14 38l-7.5.6M50 34l8-1.4M50 38l7.5.6"
      stroke="#1A1D24"
      strokeWidth="1.3"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
)

export default SealLogo
