// 真实 React + 真实浏览器回归:费用明细弹窗不得压住 DSH 标题栏(窗口按钮区)。
// 用法: node test/statistics-dialog-titlebar.mjs /path/to/node_modules   (需含 react/react-dom)
//
// 背景:DSH 桌面版(Windows)把关闭/最小化/全屏按钮画在视口顶部 40px 的覆盖层里
// (app.asar → /lib/preload-app.cjs 设 --dsh-windows-titlebar-height: 40px)。原生
// modal <dialog> 默认 inset:0 + margin:auto 在整个视口居中,顶部会钻进这条标题栏,
// 压住窗口按钮 —— 实测 1280x800 压 25px、900x600 压 35px(按钮被盖 84–88%)。
//
// 本测试锁定三条不变式:
//   A. Windows 桌面版:弹窗与 40px 标题栏零重叠,且窄窗口不横向溢出;
//   B. 桌面版全屏:--dsh-frame-chrome-top 归 0,弹窗回到普通 16px 边距(不留空隙);
//   C. 纯 Web(无标记、变量缺失):回退 0px,行为与修复前一致。
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
if (!process.argv[2]) throw new Error('Pass the node_modules directory containing react and react-dom')
const nodeModules = resolve(process.argv[2])

// 拼接顺序片段(与 scripts/build.mjs 同口径),额外暴露内部组件供测量页渲染真实弹窗。
const source = readdirSync(resolve(root, 'src/client')).filter(n => n.endsWith('.js')).sort()
  .map(n => readFileSync(resolve(root, 'src/client', n), 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.preview = { SessionStatisticsButton }; exports.apply = apply')

const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
let factory; window.__ModuleLoader__={load:m=>factory=m.factory};
${source}
const ui=factory(n=>n==='react'?React:{Tooltip:({children})=>children}).preview;
const config={locale:'zh',decimals:2,showTotalWithPlan:false};
// [关键] 明细内容必须足够高,弹窗才会被 max-height 顶到可用区上沿。
// 若这里只给一句短占位,弹窗只有 ~96px、垂直居中后根本够不到标题栏,
// 「与标题栏重叠」的断言就会**空过**(修复前也 PASS),失去回归价值。
const Tall=()=>React.createElement('div',null,...Array.from({length:120},(_,i)=>React.createElement('p',{key:i},'费用明细占位行 '+(i+1))));
const props={sessionId:'synthetic',useCost:()=>({state:{config}}),api:{loadStatistics:async()=>Tall,reload(){}}};
createRoot(document.getElementById('root')).render(React.createElement(ui.SessionStatisticsButton,{...props,entryPosition:'dock'}));`

const bundle = await build({
  stdin: { contents: entry, loader: 'js', resolveDir: root }, bundle: true, write: false,
  nodePaths: [nodeModules], format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
})

// 每个用例:同一弹窗在三种宿主环境 + 多种视口下的几何断言。
// 标题栏覆盖层高 40px,三枚窗口按钮各 46px 紧贴右上角(几何取自真实 DSH 窗口截图)。
const page = `<!doctype html><meta charset="utf-8"><title>Dialog vs titlebar regression</title>
<style>
  body{margin:0;font:14px system-ui}
  iframe{border:1px solid #ccc;display:block;margin:8px 0}
  #result{font-weight:600}
</style>
<h1>费用明细弹窗 · DSH 标题栏避让回归</h1>
<p id="result" role="status">Ready</p>
${[['dsh', 1280, 800], ['dsh', 900, 600], ['dsh', 520, 600], ['fullscreen', 1280, 800], ['web', 1280, 800],
  // 旧宿主(DSH ≤0.1.7):没有 --dsh-frame-chrome-top,只有 --dsh-frame-top-clearance。
  // 不覆盖这一档,修复会在 CI 矩阵覆盖的旧宿主上静默失效而测试仍全绿。
  ['legacy', 1280, 800], ['legacy', 900, 600],
  // macOS:不设 data-windows-titlebar,红绿灯区由 --dsh-frame-top-clearance: 48px 表达。
  ['darwin', 1280, 800], ['darwin', 900, 600]]
  .map(([env, w, h]) => `<iframe title="${env}-${w}x${h}" width="${w}" height="${h}" src="/case?env=${env}"></iframe>`).join('')}
<script>
const frames=[...document.querySelectorAll('iframe')];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// 轮询等待,且**每次都重新取 contentDocument**:iframe 尚未加载完时 contentDocument
// 是初始 about:blank(它的 readyState 也是 'complete'),若只取一次就会永远查到那个
// 过期文档。这里每 tick 重取,超时才失败。
const waitFor=(fn,timeout=8000)=>{const deadline=Date.now()+timeout;return new Promise((res,rej)=>{
  const tick=()=>{let v=null;try{v=fn()}catch{}if(v)return res(v);if(Date.now()>deadline)return rej(Error('timeout waiting for element'));setTimeout(tick,50)};
  tick();
})};
let checks=0; const check=(ok,msg)=>{checks++;if(!ok)throw Error(msg)};
(async()=>{
  try{
    for(const frame of frames){
      const env=frame.title.split('-')[0];
      const entry=await waitFor(()=>frame.contentDocument?.querySelector('.cm-stat-entry'));
      const doc=frame.contentDocument, win=frame.contentWindow, root=doc.documentElement;
      const hasTitlebar=root.hasAttribute('data-windows-titlebar');
      const isFullscreen=root.hasAttribute('data-fullscreen');
      const isDarwin=env==='darwin';
      // 有效顶部避让高度 = 平台 chrome 实际占用的高度(也就是弹窗必须让开的量):
      //   Windows 桌面版非全屏 -> 40px(标题栏覆盖层)
      //   macOS               -> 48px(红绿灯区;不设 data-windows-titlebar)
      //   全屏 / 纯 Web        -> 0
      const titlebar=(isDarwin?48:(hasTitlebar&&!isFullscreen)?40:0);
      check(!!entry,frame.title+' entry button mounted');
      entry.click(); await wait(150);
      const dialog=await waitFor(()=>doc.querySelector('dialog[open]'));
      check(!!dialog,frame.title+' dialog opens');
      const r=dialog.getBoundingClientRect();
      const overlap=Math.max(0,Math.min(r.bottom,titlebar)-Math.max(r.top,0));
      check(overlap===0,frame.title+' dialog must not overlap the titlebar (got '+overlap.toFixed(1)+'px)');
      // 关闭按钮必须在标题栏下方且不越界 —— 否则用户点不到它。
      const close=dialog.querySelector(':scope > .cm-btn');
      check(!!close,frame.title+' close button present');
      const cr=close.getBoundingClientRect();
      check(cr.top>=titlebar-0.5,frame.title+' close button stays below the titlebar');
      check(cr.right<=win.innerWidth+0.5,frame.title+' close button stays inside the viewport');
      // 窄窗口不得横向溢出。
      check(r.width<=win.innerWidth+0.5,frame.title+' dialog must not overflow horizontally (w='+r.width.toFixed(1)+' vw='+win.innerWidth+')');
      check(r.left>=-0.5,frame.title+' dialog left edge inside viewport');
      // 垂直定位:必须在标题栏**下方**的可用区域里居中(而不是整个视口居中),
      // 且不得越过视口底部。内容不高时 top = 标题栏 + (可用高-弹窗高)/2;
      // 内容被 max-height 约束时 top = 标题栏 + 16。
      const available=win.innerHeight-titlebar;
      const expectedTop=r.height>=available-32 ? titlebar+16 : titlebar+(available-r.height)/2;
      check(Math.abs(r.top-expectedTop)<=1.5,frame.title+' dialog centered below the titlebar (got '+r.top.toFixed(1)+', expected '+expectedTop.toFixed(1)+')');
      check(r.bottom<=win.innerHeight+0.5,frame.title+' dialog must not overflow the viewport bottom (bottom='+r.bottom.toFixed(1)+' vh='+win.innerHeight+')');
      // 内容超高时必须真的可滚动:断言「确实溢出且滚动范围 > 0」,而不是断言
      // overflow==='auto' —— 裸 <dialog> 的 UA 默认值就是 auto,那条断言恒真(空断言)。
      check(getComputedStyle(dialog).overflow==='auto',frame.title+' dialog scrolls its own overflow');
      check(dialog.scrollHeight>dialog.clientHeight,frame.title+' dialog content really overflows (scrollHeight='+dialog.scrollHeight+' clientHeight='+dialog.clientHeight+')');
      // 环境特定断言。
      if(env==='fullscreen') check(win.getComputedStyle(root).getPropertyValue('--dsh-frame-chrome-top').trim()==='0px',frame.title+' chrome-top is 0 in fullscreen');
      if(env==='web'){
        check(!hasTitlebar,frame.title+' plain web has no windows-titlebar marker');
        check(!win.getComputedStyle(root).getPropertyValue('--dsh-frame-chrome-top').trim(),frame.title+' plain web has no chrome-top');
        check(!win.getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance').trim(),frame.title+' plain web has no top-clearance');
        check(!win.getComputedStyle(root).getPropertyValue('--dsh-windows-titlebar-height').trim(),frame.title+' plain web has no preload titlebar height');
      }
      // 旧宿主没有 chrome-top、也没有 Windows 版 top-clearance:必须靠
      // --dsh-windows-titlebar-height 兜住,否则修复静默失效(这正是本档位要守的回归)。
      if(env==='legacy'){
        check(!win.getComputedStyle(root).getPropertyValue('--dsh-frame-chrome-top').trim(),frame.title+' legacy host has no chrome-top');
        check(!win.getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance').trim(),frame.title+' legacy host has no windows top-clearance');
        check(win.getComputedStyle(root).getPropertyValue('--dsh-windows-titlebar-height').trim()==='40px',frame.title+' legacy host exposes titlebar height');
      }
      if(env==='darwin') check(win.getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance').trim()==='48px',frame.title+' darwin exposes 48px top clearance');
      close.click(); await wait(60);
      check(!doc.querySelector('dialog[open]'),frame.title+' dialog closes');
    }
    document.getElementById('result').textContent='PASS '+checks+' assertions';
  }catch(e){document.getElementById('result').textContent='FAIL '+checks+' '+e.message;}
})();
</script>`

const server = createServer((request, response) => {
  if (request.url === '/entry.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8')
    response.end(bundle.outputFiles[0].text)
    return
  }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  if (!request.url.startsWith('/case')) { response.end(page); return }
  const env = new URL(request.url, 'http://127.0.0.1').searchParams.get('env') ?? 'dsh'
  // [真实] 逐字复刻 app.asar /lib/preload-app.cjs 的标记注入与 dsh-client-ui-layout 的变量定义。
  // darwin 不设 data-windows-titlebar(macOS 用 hiddenInset,红绿灯由系统画)。
  // legacy(DSH ≤0.1.7)**没有** chrome-top,且 top-clearance 只为 darwin 定义 ——
  // Windows 下唯一的高度信号是 preload 注入的 --dsh-windows-titlebar-height
  // (实测 0.1.7-rc.2 的 client.js:top-clearance 仅出现于 html[data-platform=darwin])。
  const preload = env === 'web' || env === 'darwin' ? '' : `
    root.dataset.windowsTitlebar='';
    root.style.setProperty('--dsh-windows-titlebar-height','40px');
    ${env === 'fullscreen' ? "root.dataset.fullscreen='true';" : ''}`
  const isDarwin = env === 'darwin'
  const frameVars = env === 'legacy'
    ? 'html[data-platform=darwin]{--dsh-frame-top-clearance:48px}'
    : isDarwin
      // macOS:不设 windows-titlebar,红绿灯区 48px;chrome-top 未定义
      ? 'html[data-platform=darwin]{--dsh-frame-top-clearance:48px}'
      // DSH ≥0.2.0:Windows 定义 chrome-top(全屏归 0);darwin 仍只有 top-clearance
      : `html[data-windows-titlebar]{--dsh-frame-top-clearance:var(--dsh-windows-titlebar-height);--dsh-frame-chrome-top:var(--dsh-windows-titlebar-height)}
html[data-windows-titlebar][data-fullscreen]{--dsh-frame-chrome-top:0px}`
  const captionHeight = isDarwin ? '48px' : 'var(--dsh-windows-titlebar-height)'
  const caption = env === 'web' ? '' : `<div id="caption" aria-hidden="true"><i>–</i><i>□</i><i>×</i></div>`
  // 纯 Web 环境**没有** preload,因此 --dsh-windows-titlebar-height 必须不存在
  // (真实 DSH 里它只由 Windows preload 注入)。若在 :root 里无条件定义它,
  // 四级回退的最后一档就会被误命中,测出的行为与真实纯 Web 不符。
  const titlebarHeightVar = env === 'web' ? '' : '--dsh-windows-titlebar-height:40px;'
  response.end(`<!doctype html><meta charset="utf-8"><style>
:root{${titlebarHeightVar}
  --dsw-alias-border-l1:#e0e5ed;--dsw-alias-border-l3:#e9eaed;--dsw-alias-label-primary:#0f1115;
  --dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#858a94;--dsw-alias-bg-base:#fff;
  --dsw-alias-bg-layer-1:#f7f8fa;--dsw-alias-bg-layer-2:#f0f3f7;--dsw-alias-interactive-bg-hover:#eff0f3;
  --dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-brand-primary:#4d6bfe}
${frameVars}
/* 真实 DSH 产品页面【没有】全局 box-sizing 重置:此处刻意不写,保持 <dialog> 为 content-box */
html,body{height:100%;margin:0;font:14px system-ui}
#caption{position:fixed;inset:0 0 auto;height:${captionHeight};background:#2b2f36;z-index:2147483647;display:flex;justify-content:flex-end}
#caption i{width:46px;height:100%;display:grid;place-items:center;color:#fff;font-style:normal}
#root{padding:24px}
</style>
${caption}
<div id="root"></div>
<script>
(function(){const env=${JSON.stringify(env)};const root=document.documentElement;if(env==='web')return;${isDarwin ? "root.dataset.platform='darwin';" : ''}${preload}})();
</script>
<script src="/entry.js"></script>`)
})
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port))
