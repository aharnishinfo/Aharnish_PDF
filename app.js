/* All document processing stays on this device. Libraries are bundled in vendor/. */
'use strict';
const tools = [
  { id: 'merge', name: 'Merge PDF', icon: '⊕', category: 'organize', description: 'Bring multiple PDFs together, in the order you choose.' },
  { id: 'split', name: 'Split PDF', icon: '✂', category: 'organize', description: 'Extract a page range or save every page as a separate PDF.' },
  { id: 'remove', name: 'Remove pages', icon: '⊖', category: 'organize', description: 'Keep what matters. Remove unwanted pages from your PDF.' },
  { id: 'organize', name: 'Organize PDF', icon: '⇄', category: 'organize', description: 'Reorder or duplicate pages with a custom page sequence.' },
  { id: 'images', name: 'JPG / PNG to PDF', icon: '▧', category: 'convert', description: 'Turn your images into one neatly packaged PDF.' },
  { id: 'jpg', name: 'PDF to JPG', icon: '▨', category: 'convert', description: 'Convert PDF pages into high-quality JPG images.' },
  { id: 'png', name: 'PDF to PNG', icon: '▧', category: 'convert', description: 'Export crisp PNG images of one page or your whole PDF.' },
  { id: 'text', name: 'PDF to text', icon: 'T', category: 'convert', description: 'Extract selectable text into a plain text document. No OCR.' },
  { id: 'rotate', name: 'Rotate PDF', icon: '↻', category: 'edit', description: 'Get the right perspective. Rotate selected pages.' },
  { id: 'numbers', name: 'Add page numbers', icon: '#', category: 'edit', description: 'Keep everything in order with numbered pages.' },
  { id: 'watermark', name: 'Watermark PDF', icon: '◇', category: 'edit', description: 'Add a subtle text watermark to selected pages.' },
  { id: 'crop', name: 'Crop PDF', icon: '⌗', category: 'edit', description: 'Trim visible page margins for a cleaner document.' },
  { id: 'edit', name: 'Edit PDF', icon: '✎', category: 'edit', description: 'Add new text at a chosen position on selected pages.' },
  { id: 'form', name: 'PDF Forms', icon: '▤', category: 'edit', description: 'Add a fillable text field to a page in your PDF.' },
  { id: 'flatten', name: 'Flatten forms', icon: '▱', category: 'edit', description: 'Make filled form fields part of the PDF page content.' },
  { id: 'compress', name: 'Compress PDF', icon: '⇣', category: 'organize', description: 'Optimize PDF structure without reducing image quality. Savings vary.' }
];
const $ = selector => document.querySelector(selector);
const dialog = $('#toolDialog');
let active, files = [], busy = false, category = 'all', urls = [], renderer;
const palettes = { organize: ['#d56552', '#fcf0ec'], convert: ['#d69a37', '#fff5e3'], edit: ['#7870ba', '#f1effb'] };
function renderCards() {
  $('#cards').replaceChildren();
  const query = $('#search').value.toLowerCase().trim();
  const matches = tools.filter(t => (category === 'all' || t.category === category) && `${t.name} ${t.description}`.toLowerCase().includes(query));
  for (const tool of matches) {
    const card = document.createElement('button');
    card.className = 'card'; card.dataset.tool = tool.id;
    card.style.setProperty('--tone', palettes[tool.category][0]);
    card.style.setProperty('--tint', palettes[tool.category][1]);
    card.innerHTML = `<span class="icon" aria-hidden="true">${tool.icon}</span><span class="arrow" aria-hidden="true">↗</span><h2>${tool.name}</h2><p>${tool.description}</p>`;
    card.addEventListener('click', () => openTool(tool.id));
    $('#cards').append(card);
  }
  $('#empty').hidden = matches.length > 0;
}
function setStatus(message, type = '') { $('#status').textContent = message; $('#status').className = type; }
function clearResults() {
  urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
  $('#downloads').replaceChildren(); $('#results').hidden = true;
}
function field(name, title, value = '', config = {}) {
  const label = document.createElement('label'); label.textContent = title;
  const control = document.createElement(config.choices ? 'select' : 'input');
  control.name = name; control.id = `option-${name}`;
  if (config.choices) {
    config.choices.forEach(([value, text]) => control.add(new Option(text, value)));
  } else {
    control.type = config.type || 'text';
    for (const key of ['min', 'max', 'step', 'placeholder', 'maxLength']) if (config[key] !== undefined) control[key] = config[key];
    control.required = Boolean(config.required);
  }
  control.value = value; label.append(control); $('#options').append(label);
}
function openTool(id) {
  if (busy) return;
  active = tools.find(t => t.id === id); files = []; clearResults(); setStatus('');
  $('#toolTitle').textContent = active.name; $('#toolText').textContent = active.description;
  if (['merge','split','remove','organize'].includes(id)) $('#toolText').textContent += ' Filled form fields are flattened to preserve their visible values in copied pages.';
  if (['edit','form'].includes(id)) $('#toolText').textContent += ' Positions use the PDF page coordinates before rotation.';
  $('#fileInput').value = ''; $('#fileInput').multiple = ['merge', 'images'].includes(id);
  $('#fileInput').accept = id === 'images' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,application/pdf';
  $('#fileHint').textContent = id === 'images' ? 'JPG or PNG • Select images in your preferred order' : id === 'merge' ? 'PDF files • Select at least two' : 'One PDF file';
  $('#options').replaceChildren(); renderFiles();
  if (['split','remove','organize','jpg','png','text','rotate','numbers','watermark','crop','edit'].includes(id)) {
    field('pages', id === 'remove' ? 'Pages to remove' : id === 'organize' ? 'Page order (e.g. 3,1,2,2)' : 'Pages (e.g. 1-3,5)', '', { placeholder: ['remove','organize'].includes(id) ? 'Required' : 'Blank = all pages', required: ['remove','organize'].includes(id) });
  }
  if (id === 'split') field('mode','Output','range',{ choices: [['range','One PDF with selected pages'],['each','Separate PDFs (ZIP)']] });
  if (['png','jpg'].includes(id)) field('scale','Image resolution','2',{ choices: [['1','Standard (72 DPI)'],['2','High (144 DPI)'],['3','Very high (216 DPI)']] });
  if (id === 'rotate') field('angle','Rotate clockwise','90',{ choices: [['90','90°'],['180','180°'],['270','270°']] });
  if (id === 'images') field('paper','Page size','original',{ choices: [['original','Fit to image'],['a4','A4 — fit with margins']] });
  if (['watermark','edit','form'].includes(id)) field('text',id === 'form' ? 'Initial field value (optional)' : 'Text (Latin characters)',id === 'watermark' ? 'CONFIDENTIAL' : '',{ required: id !== 'form', maxLength: 200 });
  if (id === 'crop') field('margin','Margin on each edge (%)','5',{ type:'number',min:0,max:20,step:1,required:true });
  if (id === 'numbers') field('start','Start numbering at','1',{ type:'number',min:1,max:999999,required:true });
  if (id === 'form') {
    field('page','Page number','1',{type:'number',min:1,required:true});
    field('fieldName','Unique field name','aharnish_field',{required:true,maxLength:80});
  }
  if (['edit','form'].includes(id)) {
    field('x','Distance from left (%)','10',{type:'number',min:0,max:80,required:true});
    field('y','Distance from bottom (%)','10',{type:'number',min:0,max:90,required:true});
  }
  if (id === 'edit') field('size','Font size (pt)','16',{type:'number',min:6,max:72,required:true});
  $('#process').textContent = id === 'png' ? 'Convert to PNG' : id === 'jpg' ? 'Convert to JPG' : active.name;
  $('#progress').hidden = true;
  dialog.showModal();
}
function renderFiles() {
  $('#fileList').replaceChildren();
  files.forEach((file, i) => {
    const li = document.createElement('li'), name = document.createElement('span'), size = document.createElement('small');
    name.textContent = file.name; size.textContent = `${(file.size / 1024).toFixed(1)} KB`; name.append(size); li.append(name);
    const actions = files.length > 1 ? [['↑','Move up',-1],['↓','Move down',1],['×','Remove',0]] : [['×','Remove',0]];
    actions.forEach(([text, title, move]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-label', `${title}: ${file.name}`);
      button.disabled = (move === -1 && i === 0) || (move === 1 && i === files.length - 1);
      button.onclick = () => { if (move) [files[i],files[i+move]] = [files[i+move],files[i]]; else files.splice(i,1); clearResults(); setStatus(''); renderFiles(); };
      li.append(button);
    });
    $('#fileList').append(li);
  });
}
function addFiles(incoming) {
  if (busy) return;
  const selected = [...incoming];
  const valid = selected.every(f => active.id === 'images' ? /\.(png|jpe?g)$/i.test(f.name) : /\.pdf$/i.test(f.name));
  if (!valid) { setStatus(active.id === 'images' ? 'Please select JPG or PNG images only.' : 'Please select PDF files only.', 'error'); return; }
  if (!$('#fileInput').multiple && selected.length > 1) { setStatus('This tool accepts one PDF at a time.', 'error'); return; }
  if (!selected.length) return;
  files = $('#fileInput').multiple ? [...files,...selected] : selected;
  clearResults(); setStatus(''); renderFiles(); $('#fileInput').value = '';
}
// Reject invalid ranges instead of silently skipping them. Preserve explicit order.
function parsePages(value, count, required = false, duplicates = false) {
  value = String(value ?? '');
  if (!value.trim()) {
    if (required) throw new Error('Enter at least one page number or range.');
    if (count > 10000) throw new Error('Please select at most 10,000 pages per operation.');
    return Array.from({length:count},(_,i) => i);
  }
  const result = [];
  for (const token of value.split(',')) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges such as 1-3,5.');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Page range “${token.trim()}” is invalid. This PDF has ${count} pages.`);
    if (result.length + end - start + 1 > 10000) throw new Error('Please select at most 10,000 pages per operation.');
    for (let n = start; n <= end; n++) result.push(n-1);
  }
  return duplicates ? result : [...new Set(result)];
}
function resultFile(blob, name) { return { blob, name }; }
function pdfResult(bytes, name) { return resultFile(new Blob([bytes], {type:'application/pdf'}),name); }
async function loadPDF(file) {
  try { return await PDFLib.PDFDocument.load(await file.arrayBuffer()); }
  catch (error) {
    if (/encrypt|password/i.test(error.message)) throw new Error('This PDF is password-protected. Unlock it in your PDF application before using this tool.');
    throw new Error(`Could not read “${file.name}”. Please choose a valid, undamaged PDF.`);
  }
}
async function pdfRenderer() {
  if (location.protocol === 'file:') throw new Error('For image and text conversion, open this project with VS Code Live Server (local HTTP), then try again.');
  if (!renderer) {
    try { renderer = await import('./vendor/pdf.min.mjs'); renderer.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', document.baseURI).href; }
    catch { throw new Error('The PDF renderer could not load. Open with Live Server and check that the vendor folder is present.'); }
  }
  return renderer;
}
function progress(current, total, message) { $('#progress').value = current/total*100; setStatus(message); }
async function zipResults(results, name) {
  if (!window.JSZip) throw new Error('ZIP library missing. Restore vendor/jszip.min.js.');
  const zip = new JSZip();
  for (const item of results) zip.file(item.name, await item.blob.arrayBuffer());
  const blob = await zip.generateAsync({type:'blob'}, metadata => progress(metadata.percent,100,'Packaging your downloads…'));
  return [resultFile(blob,name),...results];
}
async function renderPDF(file, kind, opts, stem) {
  const lib = await pdfRenderer();
  const task = lib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false});
  task.onPassword = () => { task.destroy(); };
  let pdf;
  try {
    pdf = await task.promise;
    const ids = parsePages(opts.pages || '', pdf.numPages);
    const results = [], textPages = [];
    for (let i=0; i<ids.length; i++) {
      const page = await pdf.getPage(ids[i]+1);
      progress(i,ids.length,`Processing page ${ids[i]+1} (${i+1} of ${ids.length})…`);
      if (kind === 'text') {
        const content = await page.getTextContent();
        textPages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim());
      } else {
        let viewport = page.getViewport({scale:Number(opts.scale)});
        // Bound canvas allocation on unusually large pages to avoid browser crashes.
        const factor = Math.min(1, 8192/viewport.width, 8192/viewport.height, Math.sqrt(16000000/(viewport.width*viewport.height)));
        if (factor < 1) viewport = page.getViewport({scale:Number(opts.scale)*factor});
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
          const mime = kind === 'png' ? 'image/png' : 'image/jpeg';
          const blob = await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encoding failed. Try a lower resolution.')),mime,0.92));
          if (blob.type !== mime) throw new Error(`Your browser could not create ${kind.toUpperCase()} images.`);
          results.push(resultFile(blob,`${stem}-page-${String(ids[i]+1).padStart(3,'0')}.${kind}`));
        } finally { canvas.width = 0; canvas.height = 0; }
      }
      page.cleanup();
      await new Promise(resolve => setTimeout(resolve,0));
    }
    if (kind === 'text') {
      if (!textPages.some(t => t.trim())) throw new Error('No selectable text found. This may be a scanned PDF; OCR is not included.');
      return [resultFile(new Blob([textPages.join('\n\n--- Page break ---\n\n')],{type:'text/plain;charset=utf-8'}),`${stem}.txt`)];
    }
    return results.length > 1 ? await zipResults(results,`${stem}-${kind}-pages.zip`) : results;
  } catch (error) {
    if (!pdf && /password|destroy/i.test(error.message)) throw new Error('This PDF is password-protected. Unlock it before converting.');
    throw error;
  } finally { await task.destroy(); }
}
function validateOptions(kind, input = {}) {
  const opts = {pages:'',scale:'2',paper:'original',mode:'range',angle:'90',margin:'5',start:'1',page:'1',x:'10',y:'10',size:'16',text:'',fieldName:'aharnish_field',...input};
  function number(key, name, min, max) {
    const value = Number(opts[key]);
    if (String(opts[key]).trim() === '' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
    opts[key] = value;
  }
  function choice(key, name, values) {
    if (!values.includes(String(opts[key]))) throw new Error(`Choose a valid ${name}.`);
  }
  if (kind === 'crop') number('margin','Margin percentage',0,20);
  if (kind === 'rotate') choice('angle','rotation angle',['90','180','270']);
  if (kind === 'numbers') number('start','Starting number',1,999999);
  if (kind === 'images') choice('paper','page size',['original','a4']);
  if (['png','jpg'].includes(kind)) choice('scale','image resolution',['1','2','3']);
  if (kind === 'split') choice('mode','split output',['range','each']);
  if (kind === 'form') number('page','Page number',1,Number.MAX_SAFE_INTEGER);
  if (['edit','form'].includes(kind)) { number('x','Left position',0,80); number('y','Bottom position',0,90); }
  if (kind === 'edit') number('size','Font size',6,72);
  return opts;
}
function flattenForCopy(doc) {
  const form = doc.getForm();
  if (form.getFields().length) form.flatten();
}
// EXIF may rotate or mirror a phone photo even when its stored JPEG pixels do not.
function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 255) {
    const marker = bytes[offset+1], length = view.getUint16(offset+2);
    if (marker === 218 || marker === 217 || length < 2 || offset + 2 + length > bytes.length) break;
    const start = offset + 4, end = offset + 2 + length;
    if (marker === 225 && start + 14 <= end && view.getUint32(start) === 0x45786966 && view.getUint16(start+4) === 0) {
      const tiff = start + 6, little = view.getUint16(tiff) === 0x4949;
      const directory = tiff + view.getUint32(tiff+4,little);
      if (directory < tiff || directory + 2 > end) return 1;
      const count = view.getUint16(directory,little);
      for (let i=0;i<count;i++) {
        const entry = directory + 2 + i*12;
        if (entry + 12 > end) break;
        if (view.getUint16(entry,little) === 0x112) return view.getUint16(entry+8,little);
      }
    }
    offset += length + 2;
  }
  return 1;
}
async function embedImage(doc, file, bytes, png) {
  if (png || jpegOrientation(bytes) === 1) return png ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  let bitmap;
  const canvas = document.createElement('canvas');
  try {
    bitmap = await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{imageOrientation:'from-image'});
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width*bitmap.height > 16000000) throw new Error('This rotated photo is too large. Resize it to under 16 megapixels before converting.');
    canvas.width=bitmap.width; canvas.height=bitmap.height;
    canvas.getContext('2d').drawImage(bitmap,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error(`Could not decode “${file.name}”. Try saving the photo as PNG.`);
    return await doc.embedPng(await blob.arrayBuffer());
  } finally { bitmap?.close(); canvas.width=0; canvas.height=0; }
}
async function processPDF(kind, input = {}) {
  if (!tools.some(tool => tool.id === kind)) throw new Error('Choose a supported PDF tool.');
  if (!files.length) throw new Error('Choose a file first.');
  if (files.some(file => !file.size)) throw new Error('A selected file is empty. Choose a file with content.');
  const opts = validateOptions(kind,input);
  if (!window.PDFLib) throw new Error('PDF library missing. Restore vendor/pdf-lib.min.js.');
  const {PDFDocument,degrees,rgb,StandardFonts} = PDFLib;
  const stem = files[0].name.replace(/\.[^.]+$/,'');
  if (['png','jpg','text'].includes(kind)) return renderPDF(files[0],kind,opts,stem);
  if (kind === 'images') {
    const out = await PDFDocument.create();
    for (let i=0;i<files.length;i++) {
      const f = files[i], bytes = new Uint8Array(await f.arrayBuffer());
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpg = bytes[0] === 255 && bytes[1] === 216;
      if (!png && !jpg) throw new Error(`“${f.name}” is not a valid PNG or JPG image.`);
      const image = await embedImage(out,f,bytes,png);
      const size = opts.paper === 'a4' ? [595.28,841.89] : [image.width,image.height];
      const page = out.addPage(size), margin = opts.paper === 'a4' ? 24 : 0;
      const scale = Math.min((size[0]-margin*2)/image.width,(size[1]-margin*2)/image.height);
      const w=image.width*scale,h=image.height*scale;
      page.drawImage(image,{x:(size[0]-w)/2,y:(size[1]-h)/2,width:w,height:h});
      progress(i+1,files.length,`Adding image ${i+1} of ${files.length}…`);
    }
    return [pdfResult(await out.save(),'aharnish-images.pdf')];
  }
  const doc = await loadPDF(files[0]);
  if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
  if (['merge','split','remove','organize'].includes(kind)) flattenForCopy(doc);
  if (kind === 'merge') {
    if (files.length < 2) throw new Error('Select at least two PDFs to merge.');
    for (let i=1;i<files.length;i++) {
      const source = await loadPDF(files[i]);
      flattenForCopy(source);
      (await doc.copyPages(source,source.getPageIndices())).forEach(page => doc.addPage(page));
      progress(i+1,files.length,`Merging file ${i+1} of ${files.length}…`);
    }
  } else if (['split','remove','organize'].includes(kind)) {
    let ids = parsePages(opts.pages,doc.getPageCount(),kind !== 'split',kind === 'organize');
    if (kind === 'remove') ids = doc.getPageIndices().filter(id => !ids.includes(id));
    if (!ids.length) throw new Error('At least one page must remain in the PDF.');
    if (kind === 'split' && opts.mode === 'each') {
      const results = [];
      for (const id of ids) {
        const out = await PDFDocument.create(); (await out.copyPages(doc,[id])).forEach(p => out.addPage(p));
        results.push(pdfResult(await out.save(),`${stem}-page-${id+1}.pdf`));
      }
      return results.length > 1 ? zipResults(results,`${stem}-split.zip`) : results;
    }
    const out = await PDFDocument.create(); (await out.copyPages(doc,ids)).forEach(p => out.addPage(p));
    return [pdfResult(await out.save(),`${stem}-${kind}.pdf`)];
  } else if (kind === 'flatten') {
    if (!doc.getForm().getFields().length) throw new Error('This PDF has no fillable form fields to flatten.');
    doc.getForm().flatten();
  } else if (kind === 'form') {
    const index = Number(opts.page)-1;
    if (!Number.isInteger(index) || index < 0 || index >= doc.getPageCount()) throw new Error(`Choose a page between 1 and ${doc.getPageCount()}.`);
    const form = doc.getForm(), name = opts.fieldName.trim();
    if (!name) throw new Error('Enter a field name.');
    if (form.getFields().some(f => f.getName() === name)) throw new Error('That field name already exists. Choose a unique name.');
    const font = await doc.embedFont(StandardFonts.Helvetica); checkText(font,opts.text);
    const page = doc.getPage(index), box = page.getCropBox();
    const x=box.x+box.width*Number(opts.x)/100,y=box.y+box.height*Number(opts.y)/100;
    const width=Math.min(250,box.x+box.width-x-4),height=Math.min(28,box.y+box.height-y-4);
    if (width < 20 || height < 12) throw new Error('There is not enough room for a readable form field. Choose a larger page or move the field.');
    const field = form.createTextField(name); field.setText(opts.text);
    field.addToPage(page,{x,y,width,height,font});
  } else if (kind !== 'compress') {
    const ids = parsePages(opts.pages || '',doc.getPageCount());
    const font = ['numbers','watermark','edit'].includes(kind) ? await doc.embedFont(StandardFonts.Helvetica) : null;
    if (['watermark','edit'].includes(kind)) { if (!opts.text.trim()) throw new Error('Enter some text.'); checkText(font,opts.text); }
    ids.forEach((id,i) => {
      const page = doc.getPage(id), box = page.getCropBox();
      if (kind === 'rotate') page.setRotation(degrees((page.getRotation().angle+Number(opts.angle))%360));
      if (kind === 'crop') { const m=Number(opts.margin)/100; page.setCropBox(box.x+box.width*m,box.y+box.height*m,box.width*(1-2*m),box.height*(1-2*m)); }
      if (kind === 'numbers') {
        const text = String(Number(opts.start)+i), size=Math.min(11,box.height/10);
        page.drawText(text,{x:box.x+(box.width-font.widthOfTextAtSize(text,size))/2,y:box.y+Math.min(20,box.height/10),size,font});
      }
      if (kind === 'watermark') {
        const size=Math.min(42,box.width*0.8/Math.max(1,font.widthOfTextAtSize(opts.text,1)),box.height/5);
        page.drawText(opts.text,{x:box.x+(box.width-font.widthOfTextAtSize(opts.text,size))/2,y:box.y+box.height/2,size,font,color:rgb(.5,.5,.5),opacity:.25});
      }
      if (kind === 'edit') {
        const x=box.x+box.width*Number(opts.x)/100,y=box.y+box.height*Number(opts.y)/100,size=Number(opts.size);
        if (font.widthOfTextAtSize(opts.text,size)>box.x+box.width-x || y+size>box.y+box.height) throw new Error('The text does not fit. Use shorter text, a smaller font, or change its position.');
        page.drawText(opts.text,{x,y,size,font,color:rgb(.15,.17,.22)});
      }
    });
  }
  const bytes = await doc.save({useObjectStreams:true});
  if (kind === 'compress' && bytes.length >= files[0].size) return [resultFile(files[0],`${stem}-original.pdf`)];
  return [pdfResult(bytes,`${stem}-${kind}.pdf`)];
}
function checkText(font, text) {
  try { font.encodeText(text); } catch { throw new Error('This text contains unsupported characters. Use Latin characters for added text and form values.'); }
}
$('#toolForm').addEventListener('submit',async event => {
  event.preventDefault(); if (busy) return;
  if (!files.length) { setStatus('Choose a file first.','error'); return; }
  const opts = Object.fromEntries(new FormData(event.currentTarget));
  busy = true; clearResults(); $('#controls').disabled = true; dialog.querySelector('.close').disabled = true;
  $('#progress').hidden = false; progress(0,1,'Processing on your device…');
  try {
    const results = await processPDF(active.id,opts);
    for (const item of results) {
      const link = document.createElement('a'); link.href = URL.createObjectURL(item.blob); urls.push(link.href);
      link.download = item.name; link.textContent = `↓ ${item.name}`; $('#downloads').append(link);
    }
    $('#results').hidden = false; $('#progress').value = 100;
    let message = 'Done! Use the download buttons below to save your files.';
    if (active.id === 'compress') {
      const savings = files[0].size-results[0].blob.size;
      message = savings > 0 ? `PDF optimized: ${(savings/files[0].size*100).toFixed(1)}% smaller. Download below.` : 'This PDF is already optimized. Your original file is available below; no size reduction was possible.';
    }
    setStatus(message,'success'); $('#results').scrollIntoView({block:'nearest',behavior:'smooth'});
  } catch (error) { clearResults(); setStatus(error.message || 'Could not process this file. Please try another document.','error'); }
  finally { busy = false; $('#controls').disabled = false; dialog.querySelector('.close').disabled = false; $('#progress').hidden = true; }
});
$('#fileInput').addEventListener('change',event => addFiles(event.target.files));
$('#options').addEventListener('input',() => { clearResults(); setStatus(''); });
const dropzone = $('#dropzone');
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type,event => { event.preventDefault(); if (!busy) dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type,event => { event.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop',event => addFiles(event.dataTransfer.files));
window.addEventListener('dragover',event => event.preventDefault());
window.addEventListener('drop',event => event.preventDefault());
dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close',() => { if (!dialog.open) { clearResults(); files=[]; } });
document.querySelectorAll('.close').forEach(button => button.onclick = () => button.closest('dialog').close());
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => openTool(button.dataset.action));
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  category = button.dataset.filter; $('#search').value = '';
  document.querySelectorAll('.filters [data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === category)));
  renderCards(); $('.toolkit').scrollIntoView({behavior:'smooth'});
});
$('#search').addEventListener('input',renderCards);
$('#help').onclick = () => $('#helpDialog').showModal();
renderCards();
