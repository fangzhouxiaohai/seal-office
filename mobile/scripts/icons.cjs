// 保留桌面版海豹标识，为各平台生成尺寸与遮罩符合要求的资源。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path')
app.disableHardwareAcceleration()
app.setPath('userData', path.resolve(__dirname, '../../.upgrade-private/mobile-verification/icon-profile'))
app.whenReady().then(async () => {
  const project = path.resolve(__dirname, '..')
  const source = 'data:image/png;base64,' + fs.readFileSync(path.join(project, 'static/icon.png')).toString('base64')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  await win.loadURL('about:blank')
  const draw = async (filename, size, fraction = 1, background = null, monochrome = false) => {
    const data = await win.webContents.executeJavaScript(`(async()=>{
      const image=new Image(); image.src=${JSON.stringify(source)}; await image.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=${size};const ctx=canvas.getContext('2d');
      if(${JSON.stringify(background)}){ctx.fillStyle=${JSON.stringify(background)};ctx.fillRect(0,0,canvas.width,canvas.height)}
      const width=canvas.width*${fraction};ctx.drawImage(image,(canvas.width-width)/2,(canvas.height-width)/2,width,width);
      if(${monochrome}){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let p=0;p<pixels.data.length;p+=4){
        const visible=pixels.data[p]>235&&pixels.data[p+1]>235&&pixels.data[p+2]>235;
        pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=255;if(!visible)pixels.data[p+3]=0;
      }ctx.putImageData(pixels,0,0)}
      return canvas.toDataURL('image/png').split(',')[1];
    })()`)
    const destination = path.join(project, filename)
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, Buffer.from(data, 'base64'))
  }
  for (const size of [72, 96, 144, 192]) await draw(`static/icons/android/icon${size}.png`, size)
  await draw('nativeResources/android/res/drawable-nodpi/icon_foreground.png', 432, 66 / 108)
  await draw('nativeResources/android/res/drawable-nodpi/icon_monochrome.png', 432, 66 / 108, null, true)
  await draw('static/icons/ios/appstore.png', 1024, 0.84, '#FFFFFF')
  await draw('static/icons/harmony/foreground.png', 1024, 0.66)
  await draw('static/icons/harmony/background.png', 1024, 0, '#FFFFFF')
  for (const size of [32, 180, 192, 512]) await draw(`web/public/icons/icon${size}.png`, size, size === 180 ? 0.84 : 1, '#FFFFFF')
  win.destroy(); console.log('海豹 Logo：Android 密度/自适应/单色、iOS、鸿蒙、H5 图标已生成。'); app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
