import work from '../assets/market/work.png?seal-image'
import business from '../assets/market/business.png?seal-image'
import education from '../assets/market/education.png?seal-image'
import technology from '../assets/market/technology.png?seal-image'
import people from '../assets/market/people.png?seal-image'
import industry from '../assets/market/industry.png?seal-image'
import metadata from '../assets/market/metadata.json'
import type {演示文稿} from '../ppt/deck'
import type {演示资源条目} from '../ipc/bridge'

const images={work,business,education,technology,people,industry}
const categories:Record<string,keyof typeof images>={'工作汇报':'work','商业计划':'business','教育培训':'education','产品技术':'technology','人事行政':'people','行业专题':'industry'}
export const builtinIllustrationUrls=Object.fromEntries(Object.entries(images).map(([name,url])=>[metadata[name as keyof typeof metadata].id,url]))
export function marketIllustration(category:string){return metadata[categories[category]||'work']}
export function marketResourceEntries(deck:演示文稿):演示资源条目[]{
  return Object.keys(deck.资源索引||{}).filter(id=>builtinIllustrationUrls[id]).map(id=>({标识:id,类型:'image/png',数据:builtinIllustrationUrls[id].split(',')[1]}))
}
