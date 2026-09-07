(async () => {
  const report = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const test = async (name, fn) => {
    try { await fn(); report.push(`PASS: ${name}`); }
    catch (error) { report.push(`FAIL: ${name}: ${error.message}`); }
  };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pdf = await PDFLib.PDFDocument.create();
  for (let i = 1; i <= 3; i++) pdf.addPage([300,400]).drawText(`PAGE${i}`, {x:30,y:200});
  const original = new File([await pdf.save()], 'audit.pdf', {type:'application/pdf'});
  const run = async (kind, opts = {}, input = [original]) => { files = input; return processPDF(kind, opts); };
  const read = async item => PDFLib.PDFDocument.load(await item.blob.arrayBuffer());
  const asFile = item => new File([item.blob], item.name, {type:item.blob.type});
  const textOf = async item => {
    const lib = await pdfRenderer();
    const task = lib.getDocument({data:await item.blob.arrayBuffer(),isEvalSupported:false});
    try {
      const doc = await task.promise, texts = [];
      for(let i=1;i<=doc.numPages;i++) texts.push((await (await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));
      return texts;
    } finally { await task.destroy(); }
  };
  const rejects = async (fn, pattern) => {
    let error; try { await fn(); } catch (e) { error = e; }
    assert(error && (!pattern || pattern.test(error.message)), `Expected useful error ${pattern || ''}; got ${error?.message || 'success'}`);
  };
  await test('Password-protected conversion fails promptly and permits retry',async()=>{
    const encrypted=new File([await (await fetch('tests/fixtures/encrypted.pdf')).arrayBuffer()],'encrypted.pdf');
    const lib=await pdfRenderer(),task=lib.getDocument({data:await encrypted.arrayBuffer(),password:'secret'});
    try {assert((await task.promise).numPages===1,'Encrypted fixture is not valid');} finally {await task.destroy();}
    await rejects(()=>Promise.race([run('png',{pages:'',scale:'1'},[encrypted]),delay(2000).then(()=>{throw Error('Password handling timed out');})]),/protected|unlock/i);
    assert((await run('png',{pages:'1',scale:'1'}))[0].blob.type==='image/png','Normal conversion did not recover');
  });
  await test('Phone JPEG orientation is preserved in image-to-PDF',async()=>{
    const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;
    const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,20);
    const bytes=new Uint8Array(await (await new Promise(r=>canvas.toBlob(r,'image/jpeg'))).arrayBuffer());
    // JPEG APP1 with little-endian EXIF orientation 6 (90 degrees clockwise).
    const exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
    const oriented=new File([bytes.subarray(0,2),exif,bytes.subarray(2)],'phone.jpg',{type:'image/jpeg'});
    const bitmap=await createImageBitmap(oriented);assert(bitmap.width===20 && bitmap.height===40,'Invalid EXIF fixture');bitmap.close();
    const out=await read((await run('images',{paper:'original'},[oriented]))[0]);
    assert(out.getPage(0).getWidth()===20 && out.getPage(0).getHeight()===40,'Phone photo is sideways in PDF');
  });
  await test('Split preserves requested page content and order',async()=>{
    const texts=await textOf((await run('split',{pages:'3,1',mode:'range'}))[0]);
    assert(texts.length===2 && texts[0].includes('PAGE3') && texts[1].includes('PAGE1'),'Wrong page order');
  });
  await test('Organize repeats the correct content',async()=>{
    const texts=await textOf((await run('organize',{pages:'3,1,2,2'}))[0]);
    assert(texts.map(t=>t.match(/PAGE\d/)[0]).join(',')==='PAGE3,PAGE1,PAGE2,PAGE2','Wrong repeated pages');
  });
  await test('Remove preserves remaining page content',async()=>{
    const texts=await textOf((await run('remove',{pages:'2'}))[0]);
    assert(texts.join().includes('PAGE1') && texts.join().includes('PAGE3') && !texts.join().includes('PAGE2'),'Wrong pages removed');
  });
  for (const kind of ['edit','watermark','numbers']) await test(`${kind}: new content appears only on selected page`,async()=>{
    const texts=await textOf((await run(kind,{pages:'2',text:'AUDIT_TEXT',start:'789',x:'10',y:'10',size:'16'}))[0]);
    const expected=kind==='numbers'?'789':'AUDIT_TEXT';
    assert(texts[1].includes(expected) && !texts[0].includes(expected) && !texts[2].includes(expected),'Added content missing or on wrong pages');
  });
  await test('Crop uses existing crop-box offset; zero margin is unchanged',async()=>{
    const doc=await PDFLib.PDFDocument.load(await original.arrayBuffer());doc.getPage(0).setCropBox(20,30,200,300);
    const input=[new File([await doc.save()],'offset.pdf')];
    let out=await read((await run('crop',{pages:'1',margin:'10'},input))[0]),box=out.getPage(0).getCropBox();
    assert(box.x===40 && box.y===60 && box.width===160 && box.height===240,'Wrong crop offset');
    out=await read((await run('crop',{pages:'1',margin:'0'},input))[0]);box=out.getPage(0).getCropBox();
    assert(box.x===20 && box.width===200,'Zero crop unexpectedly changes page');
  });
  const formResult=(await run('form',{page:'1',fieldName:'auditField',text:'FORM_VALUE',x:'10',y:'10'}))[0];
  const formFile=asFile(formResult);
  await test('Flatten preserves visible form value',async()=>{
    const result=(await run('flatten',{},[formFile]))[0];
    assert((await textOf(result))[0].includes('FORM_VALUE'),'Filled value disappeared');
    assert((await read(result)).getForm().getFields().length===0,'Field remains editable');
  });
  await test('Splitting form PDFs preserves visible filled values',async()=>{
    const result=(await run('split',{pages:'1',mode:'range'},[formFile]))[0];
    assert((await textOf(result))[0].includes('FORM_VALUE'),'Filled value not in copied page content');
  });
  await test('Merging form PDFs preserves visible values from later files',async()=>{
    const result=(await run('merge',{},[original,formFile]))[0];
    assert((await textOf(result))[3].includes('FORM_VALUE'),'Later PDF form value not in page content');
  });
  await test('Duplicate field names and invalid form pages rejected',async()=>{
    await rejects(()=>run('form',{page:'1',fieldName:'auditField',text:'x',x:'10',y:'10'},[formFile]),/already exists/i);
    await rejects(()=>run('form',{page:'4',fieldName:'new',text:'',x:'10',y:'10'}),/page between/i);
  });
  await test('Tiny pages cannot produce invalid form rectangles',async()=>{
    const tiny=await PDFLib.PDFDocument.create();tiny.addPage([10,10]);
    const input=[new File([await tiny.save()],'tiny.pdf')];
    await rejects(()=>run('form',{page:'1',fieldName:'tiny',text:'',x:'80',y:'90'},input),/fit|small|room/i);
  });
  await test('Unsupported added text and overflowing text rejected',async()=>{
    await rejects(()=>run('edit',{pages:'1',text:'हिन्दी',x:'10',y:'10',size:'16'}),/unsupported|Latin/i);
    await rejects(()=>run('edit',{pages:'1',text:'A'.repeat(200),x:'10',y:'10',size:'72'}),/fit/i);
  });
  await test('Corrupt PDFs and disguised images rejected',async()=>{
    await rejects(()=>run('rotate',{angle:'90'},[new File(['garbage'],'bad.pdf')]),/valid|undamaged/i);
    await rejects(()=>run('images',{paper:'a4'},[new File(['garbage'],'bad.png')]),/valid/i);
  });
  await test('Blank/scanned text extraction explains missing OCR',async()=>{
    const blank=await PDFLib.PDFDocument.create();blank.addPage();
    const input=[new File([await blank.save()],'scan.pdf')];
    await rejects(()=>run('text',{},input),/No selectable text/i);
  });
  await test('One-file merge and flatten without forms rejected',async()=>{
    await rejects(()=>run('merge'),/at least two/i); await rejects(()=>run('flatten'),/no fillable/i);
  });
  await test('Invalid numeric options cannot generate broken PDFs',async()=>{
    await rejects(()=>run('crop',{margin:'-1'}),/margin/i);
    await rejects(()=>run('crop',{margin:'NaN'}),/margin/i);
    await rejects(()=>run('rotate',{angle:'45'}),/rotation|angle/i);
    await rejects(()=>run('numbers',{start:'-1'}),/number/i);
  });
  await test('Rapid close/reopen does not erase newly selected files',async()=>{
    if(dialog.open) {dialog.close();await delay(30);}
    openTool('merge');addFiles([original]);dialog.close();
    openTool('png');addFiles([original]);await delay(50);
    assert(files.length===1 && files[0]===original,'Queued close event cleared current files');
    dialog.close();await delay(30);
  });
  await test('Every tool completes via its actual form UI',async()=>{
    const png=(await run('png',{pages:'1',scale:'1'}))[0];
    for (const tool of tools) {
      openTool(tool.id);
      const incoming=tool.id==='merge'?[original,original]:tool.id==='images'?[asFile(png)]:tool.id==='flatten'?[formFile]:[original];
      const transfer=new DataTransfer();incoming.forEach(f=>transfer.items.add(f));
      $('#fileInput').files=transfer.files;$('#fileInput').dispatchEvent(new Event('change'));
      const values={pages:tool.id==='remove'?'2':tool.id==='organize'?'3,1,2':'1',text:'UI_TEXT'};
      for(const [key,value] of Object.entries(values)){const control=$('#option-'+key);if(control)control.value=value;}
      $('#toolForm').requestSubmit();
      for(let n=0;n<200 && busy;n++)await delay(25);
      assert(!busy && !$('#results').hidden && $('#downloads a'),`${tool.id} failed: ${$('#status').textContent}`);
      const link=$('#downloads a'),response=await fetch(link.href);
      assert(response.ok && (await response.blob()).size>0,`${tool.id} download link is empty`);
      dialog.close();await delay(30);
    }
  });
  await test('File ordering, removal, drag/drop, and empty-submit errors',async()=>{
    openTool('merge');const second=new File([await original.arrayBuffer()],'second.pdf');addFiles([original,second]);
    $('#fileList li:last-child button').click();assert(files[0].name==='second.pdf','Move up failed');
    $('#fileList li button:last-child').click();assert(files.length===1 && files[0]===original,'Remove failed');
    const transfer=new DataTransfer();transfer.items.add(second);$('#dropzone').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true}));
    assert(files.length===2,'Drop did not add file');dialog.close();await delay(30);
    openTool('png');$('#toolForm').requestSubmit();assert($('#status').textContent.includes('Choose a file'),'Missing-file message absent');
    addFiles([new File(['x'],'bad.docx')]);assert(!files.length && $('#status').className==='error','Invalid file type accepted');
    dialog.close();await delay(30);
  });
  await test('Help, category filters, no-results search, and navigation',async()=>{
    $('#help').click();assert($('#helpDialog').open,'Help does not open');$('#helpDialog .close').click();
    for(const group of ['all','organize','convert','edit']) {
      document.querySelector(`.filters [data-filter="${group}"]`).click();
      assert(document.querySelectorAll('.card').length===tools.filter(t=>group==='all'||t.category===group).length,'Wrong category count');
    }
    $('#search').value='zzzzzz';$('#search').dispatchEvent(new Event('input'));assert(!$('#empty').hidden,'Missing empty-search feedback');
    document.querySelector('[data-filter="all"]').click();
    document.querySelector('[data-action="edit"]').click();assert($('#toolTitle').textContent==='Edit PDF','Edit navigation opens wrong tool');dialog.close();await delay(30);
  });
  await test('UI recovers after corrupt-file errors and clears stale downloads',async()=>{
    openTool('png');addFiles([new File(['not a PDF'],'broken.pdf')]);$('#toolForm').requestSubmit();
    for(let i=0;i<200 && busy;i++)await delay(25);
    assert(!busy && $('#status').className==='error' && $('#results').hidden && !$('#controls').disabled,'Error left the tool blocked');
    addFiles([original]);$('#option-pages').value='1';$('#toolForm').requestSubmit();
    const blocked=new Event('cancel',{cancelable:true});dialog.dispatchEvent(blocked);
    assert(blocked.defaultPrevented,'Escape closes tool during processing');
    $('#toolForm').requestSubmit();
    for(let i=0;i<200 && busy;i++)await delay(25);
    assert(!$('#results').hidden && document.querySelectorAll('#downloads a').length===1,'Retry or duplicate-submit protection failed');
    const oldURL=$('#downloads a').href;$('#option-pages').value='2';$('#option-pages').dispatchEvent(new Event('input',{bubbles:true}));
    assert($('#results').hidden,'Old result still offered after settings change');
    let revoked=false;try{await fetch(oldURL);}catch{revoked=true;}assert(revoked,'Old download object URL not released');
    dialog.close();await delay(30);
  });
  return report;
})()
