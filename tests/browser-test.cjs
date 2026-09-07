const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
require('./make-fixtures.cjs');
const root = path.resolve(__dirname,'..');
// A project Pages site lives below /repository-name/, not necessarily at /.
const basePath = '/Aharnish_PDF/';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((req,res) => {
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  if (!pathname.startsWith(basePath)) {res.writeHead(404).end();return;}
  const relative=pathname.slice(basePath.length) || 'index.html';
  const target=path.resolve(root,relative);
  if (!target.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  // Match the case-sensitive paths used by static hosting, even on Windows.
  let directory=root;
  for (const segment of relative.split('/')) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory() || !fs.readdirSync(directory).includes(segment)) {res.writeHead(404).end();return;}
    directory=path.join(directory,segment);
  }
  fs.readFile(target,(error,bytes) => {if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(target)] || 'application/octet-stream');res.end(bytes);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'aharnish-browser-'));
  const proc=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let socket;
  try {
    const wsUrl=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Chrome launch timed out')),15000);
      proc.on('error',reject);proc.stderr.on('data',chunk=>{const m=chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});
    });
    const port=new URL(wsUrl).port;
    const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let serial=0;const waiting=new Map();
    const pageErrors=[],assetErrors=[],externalRequests=[];
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data),params=message.params;
      if(message.method==='Runtime.exceptionThrown')pageErrors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
      if(message.method==='Network.responseReceived' && params.response.status>=400 && /\.(?:js|mjs|css)(?:\?|$)/.test(params.response.url))assetErrors.push(params.response.url);
      if(message.method==='Network.requestWillBeSent' && /^https?:/.test(params.request.url) && !params.request.url.startsWith(`http://127.0.0.1:${server.address().port}/`))externalRequests.push(params.request.url);
    });
    socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(waiting.has(m.id)){const {resolve,reject}=waiting.get(m.id);waiting.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}});
    const call=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++serial,timeout=setTimeout(()=>{waiting.delete(id);reject(Error(`${method} timed out`));},60000);
      waiting.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
      socket.send(JSON.stringify({id,method,params}));
    });
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${basePath}`});
    for(let i=0;i<100;i++) {const r=await call('Runtime.evaluate',{expression:'typeof processPDF === "function" && !!window.PDFLib'});if(r.result.value)break;await new Promise(r=>setTimeout(r,100));}
    const tested=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const report=[]; const assert=(ok,msg)=>{if(!ok)throw Error(msg);report.push(msg)};
      const make=await PDFLib.PDFDocument.create();
      for(let i=0;i<3;i++){const p=make.addPage([300,400]);p.drawText('Test page '+(i+1),{x:30,y:200});}
      const original=new File([await make.save()],'sample.pdf',{type:'application/pdf'});
      const read=async r=>PDFLib.PDFDocument.load(await r.blob.arrayBuffer());
      const run=async(kind,opts={})=>{files=[original];return processPDF(kind,opts)};
      assert(document.querySelectorAll('.card').length===16,'16 tool cards render');
      const png=await run('png',{pages:'1-2',scale:'1'});
      assert(png.length===3 && png[0].name.endsWith('.zip'),'Multi-page PNG includes ZIP and individual files');
      const sig=new Uint8Array(await png[1].blob.arrayBuffer());
      assert(png[1].blob.type==='image/png' && sig.slice(0,8).join(',')==='137,80,78,71,13,10,26,10','PNG download contains actual PNG bytes');
      const bitmap=await createImageBitmap(png[1].blob);assert(bitmap.width===300 && bitmap.height===400,'PNG has expected rendered dimensions');bitmap.close();
      const zip=await JSZip.loadAsync(png[0].blob);assert(Object.keys(zip.files).length===2,'ZIP contains both PNG pages');
      const jpg=await run('jpg',{pages:'2',scale:'2'}), j=new Uint8Array(await jpg[0].blob.arrayBuffer());
      assert(jpg[0].blob.type==='image/jpeg' && j[0]===255 && j[1]===216,'JPG download contains actual JPEG bytes');
      let out=await read((await run('split',{pages:'3,1',mode:'range'}))[0]);assert(out.getPageCount()===2,'Split extracts selected pages');
      assert((await run('split',{pages:'1-3',mode:'each'})).length===4,'Split each page includes ZIP');
      out=await read((await run('remove',{pages:'2'}))[0]);assert(out.getPageCount()===2,'Remove pages works');
      out=await read((await run('organize',{pages:'3,1,2,2'}))[0]);assert(out.getPageCount()===4,'Organize supports duplicates');
      files=[original,original];out=await read((await processPDF('merge',{}))[0]);assert(out.getPageCount()===6,'Merge produces six pages');
      out=await read((await run('rotate',{pages:'2',angle:'90'}))[0]);assert(out.getPage(1).getRotation().angle===90 && out.getPage(0).getRotation().angle===0,'Rotation only affects selected pages');
      out=await read((await run('crop',{pages:'1',margin:'5'}))[0]);assert(out.getPage(0).getCropBox().width===270,'Crop changes visible box');
      for(const kind of ['numbers','watermark','edit']) {out=await read((await run(kind,{pages:'1',text:'Hello',start:'1',x:'10',y:'10',size:'16'}))[0]);assert(out.getPageCount()===3,kind+' saves a valid PDF');}
      const form=(await run('form',{page:'1',fieldName:'test',text:'Value',x:'10',y:'10'}))[0];out=await read(form);assert(out.getForm().getTextField('test').getText()==='Value','Fillable form saves its value');
      files=[new File([form.blob],'form.pdf')];out=await read((await processPDF('flatten',{}))[0]);assert(out.getForm().getFields().length===0,'Flatten removes interactive fields');
      const txt=await run('text',{pages:'2'});assert((await txt[0].blob.text()).includes('Test page 2'),'PDF text extraction works');
      const compressed=await run('compress');assert(compressed[0].blob.size<=original.size,'Compression never returns a larger file');
      files=[new File([png[1].blob],'one.png'),new File([jpg[0].blob],'two.jpg')];out=await read((await processPDF('images',{paper:'a4'}))[0]);assert(out.getPageCount()===2 && Math.abs(out.getPage(0).getWidth()-595.28)<.01,'PNG and JPG merge into A4 PDF');
      for(const range of ['0','4','3-1','one','1,']) {let failed=false;try{parsePages(range,3)}catch{failed=true}assert(failed,'Invalid range rejected: '+range);}
      let failed=false;try{await run('remove',{pages:'1-3'})}catch{failed=true}assert(failed,'Removing every page is rejected');
      openTool('png'); const dt=new DataTransfer();dt.items.add(original);document.querySelector('#fileInput').files=dt.files;document.querySelector('#fileInput').dispatchEvent(new Event('change'));
      document.querySelector('#option-pages').value='1';document.querySelector('#toolForm').requestSubmit();
      for(let i=0;i<100 && busy;i++)await new Promise(r=>setTimeout(r,50));
      assert(document.querySelector('#downloads a').download.endsWith('.png'),'PNG upload-to-download UI flow succeeds');
      document.querySelector('#toolDialog .close').click();
      document.querySelector('[data-filter="convert"]').click();assert(document.querySelectorAll('.card').length===4,'Conversion filter works');
      document.querySelector('#search').value='PNG';document.querySelector('#search').dispatchEvent(new Event('input'));assert(document.querySelectorAll('.card').length===2,'Tool search works');
      document.querySelector('[data-filter="all"]').click();
      return report;
    })()`});
    if(tested.exceptionDetails)throw Error(tested.exceptionDetails.exception?.description || tested.exceptionDetails.text);
    console.log(tested.result.value.join('\n'));
    const audit=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:fs.readFileSync(path.join(__dirname,'audit.js'),'utf8')});
    if(audit.exceptionDetails)throw Error(audit.exceptionDetails.exception?.description || audit.exceptionDetails.text);
    console.log(audit.result.value.join('\n'));
    if(audit.result.value.some(line=>line.startsWith('FAIL')))throw Error('Extended audit failed');
    const downloadPath=path.join(profile,'downloads');fs.mkdirSync(downloadPath);
    await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath});
    const download=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const doc=await PDFLib.PDFDocument.create();doc.addPage([100,150]);doc.addPage([100,150]);
      openTool('png');addFiles([new File([await doc.save()],'download-check.pdf',{type:'application/pdf'})]);
      document.querySelector('#toolForm').requestSubmit();
      for(let i=0;i<200 && busy;i++)await new Promise(r=>setTimeout(r,25));
      if(busy || document.querySelector('#results').hidden)throw Error('Download UI failed');
      const links=[...document.querySelectorAll('#downloads a')];links[0].click();links[1].click();
      return links.slice(0,2).map(a=>a.download);
    })()`});
    if(download.exceptionDetails)throw Error(download.exceptionDetails.exception?.description || download.exceptionDetails.text);
    for(let i=0;i<100;i++) {
      if(download.result.value.every(name=>fs.existsSync(path.join(downloadPath,name))))break;
      await new Promise(r=>setTimeout(r,100));
    }
    for(const name of download.result.value) {
      const bytes=fs.readFileSync(path.join(downloadPath,name));
      if(name.endsWith('.png') && bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Downloaded PNG signature is invalid');
      if(name.endsWith('.zip') && bytes.subarray(0,4).toString('hex')!=='504b0304')throw Error('Downloaded ZIP signature is invalid');
    }
    console.log('Browser saved actual PNG and ZIP downloads to disk with correct signatures');
    await call('Runtime.evaluate',{expression:'document.querySelector("#toolDialog").close()'});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Runtime.evaluate',{awaitPromise:true,expression:'(async()=>{window.scrollTo({top:0,behavior:"instant"});await new Promise(r=>setTimeout(r,100));})()'});
    const desktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(__dirname,'desktop-preview.png'),Buffer.from(desktop.data,'base64'));
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const layout=await call('Runtime.evaluate',{expression:'document.documentElement.scrollWidth <= innerWidth',returnByValue:true});
    if(!layout.result.value)throw Error('Mobile page overflows horizontally');
    console.log('Mobile layout has no horizontal overflow');
    const mobileDialog=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      openTool('form');await new Promise(r=>setTimeout(r,30));
      const box=document.querySelector('#toolDialog').getBoundingClientRect();
      const ok=box.left>=0 && box.right<=innerWidth && document.querySelector('#toolDialog').scrollWidth<=document.querySelector('#toolDialog').clientWidth;
      document.querySelector('#toolDialog').close();return ok;
    })()`});
    if(!mobileDialog.result.value)throw Error('Mobile form dialog overflows horizontally');
    console.log('Mobile form dialog fits viewport');
    await call('Runtime.evaluate',{awaitPromise:true,expression:'(async()=>{window.scrollTo({top:0,behavior:"instant"});await new Promise(r=>setTimeout(r,100));})()'});
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(__dirname,'mobile-preview.png'),Buffer.from(shot.data,'base64'));
    if(pageErrors.length)throw Error(`Uncaught page errors: ${pageErrors.join('; ')}`);
    if(assetErrors.length)throw Error(`Broken deployment assets: ${assetErrors.join('; ')}`);
    if(externalRequests.length)throw Error(`Unexpected external requests: ${externalRequests.join('; ')}`);
    console.log('GitHub Pages-style subpath: no missing script/style assets, uncaught page errors, or external HTTP requests');
    console.log('PASS: browser integration checks');
  } finally {socket?.close();proc.kill();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
