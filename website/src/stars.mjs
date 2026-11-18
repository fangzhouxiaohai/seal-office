// 官网星空动效：在画布上绘制缓慢漂移的闪烁星点与偶发流星，尊重系统减少动态效果设置。
const PALETTE = [
  [255, 255, 255],
  [186, 205, 255],
  [168, 196, 255],
  [216, 192, 255],
  [154, 226, 255],
]

const MIN_STARS = 30
const MAX_STARS = 220
const AREA_PER_STAR = 9000

export function starCountForArea(width, height) {
  const area = Math.max(0, Number(width) || 0) * Math.max(0, Number(height) || 0)
  return Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round(area / AREA_PER_STAR)))
}

export function createStars({ width, height, count, random = Math.random }) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : starCountForArea(width, height)
  const stars = []
  for (let index = 0; index < total; index += 1) {
    stars.push({
      x: random() * width,
      y: random() * height,
      radius: 0.4 + random() * 1.3,
      alpha: 0.35 + random() * 0.6,
      phase: random() * Math.PI * 2,
      speed: 0.35 + random() * 1.1,
      drift: 0.02 + random() * 0.06,
      color: PALETTE[Math.floor(random() * PALETTE.length) % PALETTE.length],
    })
  }
  return stars
}

function drawStar(context, star, time, width) {
  const twinkle = 0.55 + 0.45 * Math.sin(star.phase + time * star.speed)
  const alpha = Math.min(1, Math.max(0, star.alpha * twinkle))
  const x = ((star.x + time * star.drift * 20) % (width + 4)) - 2
  const [r, g, b] = star.color
  context.beginPath()
  context.fillStyle = `rgba(${r},${g},${b},${alpha})`
  context.arc(x, star.y, star.radius, 0, Math.PI * 2)
  context.fill()
  if (star.radius > 1.25) {
    context.fillStyle = `rgba(${r},${g},${b},${alpha * 0.32})`
    context.fillRect(x - star.radius * 3, star.y - 0.5, star.radius * 6, 1)
    context.fillRect(x - 0.5, star.y - star.radius * 3, 1, star.radius * 6)
  }
}

function drawMeteor(context, meteor, time) {
  const elapsed = (time - meteor.start) / 1000
  const duration = meteor.duration / 1000
  const progress = elapsed / duration
  if (progress < 0 || progress > 1) return false
  const fade = Math.sin(Math.PI * Math.min(1, progress))
  const headX = meteor.x + meteor.vx * elapsed
  const headY = meteor.y + meteor.vy * elapsed
  const tailX = headX - meteor.vx * meteor.tail
  const tailY = headY - meteor.vy * meteor.tail
  const gradient = context.createLinearGradient(headX, headY, tailX, tailY)
  gradient.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.strokeStyle = gradient
  context.lineWidth = 1.6
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(headX, headY)
  context.lineTo(tailX, tailY)
  context.stroke()
  context.beginPath()
  context.fillStyle = `rgba(255,255,255,${0.9 * fade})`
  context.arc(headX, headY, 1.6, 0, Math.PI * 2)
  context.fill()
  return true
}

export function initStarfield(canvas, { random = Math.random } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null
  const context = canvas.getContext('2d')
  if (!context) return null
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = 0
  let height = 0
  let stars = []
  let meteor = null
  let nextMeteorAt = 2600
  let frame = 0
  let running = false

  const render = (time) => {
    context.clearRect(0, 0, width, height)
    const seconds = time / 1000
    for (const star of stars) drawStar(context, star, seconds, width)
    if (reduced) return
    if (!meteor && time >= nextMeteorAt) {
      meteor = {
        x: width * (0.12 + random() * 0.76),
        y: height * 0.32 * random(),
        vx: -(150 + random() * 170),
        vy: 90 + random() * 90,
        tail: 0.32 + random() * 0.22,
        start: time,
        duration: 900 + random() * 500,
      }
    }
    if (meteor && !drawMeteor(context, meteor, time)) {
      meteor = null
      nextMeteorAt = time + 3800 + random() * 5200
    }
  }

  const resize = () => {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    stars = createStars({ width, height, random })
    if (reduced) render(4200)
  }

  const tick = (time) => {
    frame = 0
    if (!running) return
    render(time + 4200)
    frame = requestAnimationFrame(tick)
  }
  const start = () => {
    if (reduced || running || typeof requestAnimationFrame !== 'function') return
    running = true
    frame = requestAnimationFrame(tick)
  }
  const stop = () => {
    running = false
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  resize()
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas)
  else if (typeof addEventListener === 'function') addEventListener('resize', resize)

  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      entries.forEach(entry => (entry.isIntersecting ? start() : stop()))
    }, { threshold: 0.02 }).observe(canvas)
  } else {
    start()
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  }
  return { start, stop, resize }
}

export function autoStarfields(selector = '[data-stars]') {
  if (typeof document === 'undefined') return []
  return [...document.querySelectorAll(selector)].map(canvas => initStarfield(canvas)).filter(Boolean)
}
