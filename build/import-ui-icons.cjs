// Promote approved static vectors. No scripts, external resources or HTML.
const fs = require('fs'), path = require('path')
const { SaxesParser } = require('saxes')
const root = path.resolve(__dirname, '..')
const approved = path.join(root, 'opendesign/mockups/ui-icons/assets')
const allowedTags = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','clipPath'])
const attrsMap = { 'stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin','stroke-dasharray':'strokeDasharray','fill-rule':'fillRule','clip-rule':'clipRule','clip-path':'clipPath' }
function parse(file) {
  let top; const stack = [], parser = new SaxesParser()
  parser.on('opentag', tag => {
    if (!allowedTags.has(tag.name)) throw Error('Unsupported vector tag: '+tag.name)
    const attrs = {}
    for (const [key,value] of Object.entries(tag.attributes)) {
      if (['xmlns','color','style','aria-hidden','focusable'].includes(key) || (tag.name === 'svg' && ['width','height'].includes(key))) continue
      if (/^on/i.test(key) || /href/i.test(key)) throw Error('Interactive or external SVG attribute rejected')
      attrs[attrsMap[key] || key] = ['#34373D','#34373d'].includes(value) ? 'currentColor' : value
    }
    const node = {tag:tag.name,attrs,children:[]}
    if (stack.length) stack[stack.length-1].children.push(node); else top=node
    stack.push(node)
  })
  parser.on('closetag', () => stack.pop())
  parser.on('error', error => { throw error })
  parser.write(fs.readFileSync(file,'utf8')).close()
  if (!top || top.tag !== 'svg' || !top.attrs.viewBox) throw Error('Invalid SVG root: '+file)
  return top
}
const library = {}
for (const file of fs.readdirSync(path.join(approved,'pc')).filter(name=>name.endsWith('.svg')).sort()) {
  const name = path.basename(file,'.svg')
  library[name] = { pc:parse(path.join(approved,'pc',file)), mobile:parse(path.join(approved,'mobile',file)) }
}
fs.writeFileSync(path.join(root,'renderer/src/components/iconLibrary.json'),JSON.stringify(library)+'\n')
console.log(JSON.stringify({icons:Object.keys(library).length,approved:true,output:'renderer/src/components/iconLibrary.json'}))
