import './styles.css'

const toggle = document.querySelector('.menu-toggle')
const navigation = document.querySelector('#navigation')

if (toggle && navigation) {
  const setMenu = (expanded) => {
    toggle.setAttribute('aria-expanded', String(expanded))
    navigation.classList.toggle('is-open', expanded)
  }
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'))
  navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)))
  window.addEventListener('resize', () => { if (window.innerWidth > 760) setMenu(false) })
}
