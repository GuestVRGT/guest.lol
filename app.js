window.FACE_FILES=[];
const DEFAULT_EYES_SRC="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAYCAYAAAC+Ot5rAAAAqklEQVR42u2UQQ6EIAxF2Yz3v7JZd4YZS1sE2nZn/sYQHtoPihBCFOI0rY6q+kSHdZ+R1pTQNqV6eCRtrERn/1qKbSPp6GWy0lm6UnR1pN7WQo79K3H0hZTj/UgcfSHF7Tj6QkrKcX6Ro6+k5BgZJ0d/kZL/zNFfQqTiR6rF4+hvITL/Udrj8VXv6DchMv/ztv9QZ4/kI0u/CZH5j/a9s+x3yD1c9tRPiMx/vL3P6Oht+SFE5v/Y7t/Z0R9CZP7j7f2GOvoL+QIZjQ1nl2eCuwAAAABJRU5ErkJggg==";
let defaultEyesImg=new Image();
defaultEyesImg.onload=function(){if(typeof drawFace==="function")drawFace(0);};
defaultEyesImg.src=DEFAULT_EYES_SRC;
const FACE_SCALE=1.0;
let mouthImgs=[],currentMouthSet="custom",smoothMouthIdx=0;
let faceMode="dark";
function loadMouthSet(key){
  const sets=(typeof MOUTH_SETS!=="undefined")?MOUTH_SETS:{};
  const set=sets[key]||Object.values(sets)[0]||{frames:[]};
  currentMouthSet=key;
  mouthImgs=(set.frames||[]).map(src=>{const img=new Image();img.onload=()=>{if(typeof drawFace==="function")drawFace(0);};img.src=src;return img;});
  const grid=document.getElementById("mouthGrid");
  if(grid)grid.querySelectorAll(".mouth-thumb").forEach(t=>t.classList.toggle("active",t.dataset.key===key));
  if(typeof drawFace==="function")drawFace(0);
}
function buildMouthGrid(){
  const grid=document.getElementById("mouthGrid");
  if(!grid||typeof MOUTH_SETS==="undefined")return;
  grid.innerHTML="";
  Object.keys(MOUTH_SETS).forEach(key=>{
    const set=MOUTH_SETS[key];
    const btn=document.createElement("button");
    btn.type="button";btn.className="mouth-thumb"+(key===currentMouthSet?" active":"");
    btn.dataset.key=key;btn.title=set.name;
    const preview=document.createElement("img");
    preview.src=(set.frames||[])[0]||"";
    btn.appendChild(preview);
    const label=document.createElement("span");label.textContent=set.name;btn.appendChild(label);
    btn.onclick=()=>loadMouthSet(key);
    grid.appendChild(btn);
  });
}
const canvas=document.getElementById("faceCanvas");
const ctx=canvas.getContext("2d");
ctx.imageSmoothingEnabled=false;
const visCanvas=document.getElementById("visCanvas");
const visCtx=visCanvas?visCanvas.getContext("2d"):null;
const idleGrid=document.getElementById("idleGrid");
const audioInput=document.getElementById("audioInput");
const playBtn=document.getElementById("playBtn");
const stopBtn=document.getElementById("stopBtn");
const exportGifBtn=document.getElementById("exportGifBtn");
const exportVidBtn=document.getElementById("exportVidBtn");
const statusEl=document.getElementById("status");
const progressFill=document.getElementById("progressFill");
const sensSlider=document.getElementById("sens");
const smoothSlider=document.getElementById("smooth");
const stageEl=document.getElementById("stage");
let isPlaying=false,audioCtx,analyser,source,audioBuffer,currentLevel=0,animId;
let mediaElement=null,mediaObjectUrl=null,useMediaElement=false;
function setFaceMode(mode){
  faceMode=mode==="light"?"light":"dark";
  document.querySelectorAll(".face-mode-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.mode===faceMode);
    b.style.borderColor=b.dataset.mode===faceMode?"#7c3aed":"transparent";
  });
  if(stageEl){
    stageEl.style.backgroundColor=faceMode==="dark"?"#000000":"#ffffff";
    stageEl.style.borderColor=faceMode==="dark"?"#222":"#ddd";
  }
  if(!isPlaying) drawFace(0);
}
function buildGrid(){
  if(!idleGrid)return;
  idleGrid.innerHTML="";
  const row=document.createElement("div");
  row.style.cssText="display:flex;gap:8px;width:100%;grid-column:1/-1;";
  [["dark","Black face"],["light","White face"]].forEach(([mode,label])=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="face-mode-btn"+(faceMode===mode?" active":"");
    btn.dataset.mode=mode;
    btn.textContent=label;
    btn.style.cssText="flex:1;padding:10px;border-radius:12px;font-weight:800;font-size:0.85rem;cursor:pointer;border:2px solid "+(faceMode===mode?"#7c3aed":"transparent")+";background:"+(mode==="dark"?"#111":"#f3f0fa")+";color:"+(mode==="dark"?"#fff":"#1e1b2e");
    btn.onclick=()=>setFaceMode(mode);
    row.appendChild(btn);
  });
  idleGrid.appendChild(row);
}
function drawTinted(img, dx, dy, dw, dh){
  if(faceMode==="dark"){
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const off=document.createElement("canvas");
  off.width=img.naturalWidth||img.width;
  off.height=img.naturalHeight||img.height;
  const o=off.getContext("2d");
  o.imageSmoothingEnabled=false;
  o.drawImage(img,0,0);
  try{
    const id=o.getImageData(0,0,off.width,off.height);
    const d=id.data;
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<20){d[i+3]=0;continue;}
      d[i]=d[i+1]=d[i+2]=0;
      d[i+3]=255;
    }
    o.putImageData(id,0,0);
  }catch(_){}
  ctx.drawImage(off, dx, dy, dw, dh);
}
function drawFace(mouthLevel){
  const size=canvas.width;
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle=faceMode==="dark"?"#000000":"#ffffff";
  ctx.fillRect(0,0,size,size);
  const faceSize=Math.floor(size*0.92*FACE_SCALE);
  const y=Math.floor((size-faceSize)/2);
  ctx.imageSmoothingEnabled=false;
  if(defaultEyesImg.complete&&defaultEyesImg.naturalWidth){
    const eyeW=Math.floor(faceSize*0.50);
    const eyeH=Math.floor(eyeW*(defaultEyesImg.naturalHeight/defaultEyesImg.naturalWidth));
    const eyeX0=Math.floor((size-eyeW)/2);
    const eyeY0=Math.floor(size*0.22);
    drawTinted(defaultEyesImg, eyeX0, eyeY0, eyeW, eyeH);
  } else {
    const cx=size/2, eyeY=size*0.38, r=Math.max(6, faceSize*0.09);
    ctx.fillStyle=faceMode==="dark"?"#ffffff":"#000000";
    ctx.beginPath();ctx.arc(cx-faceSize*0.18,eyeY,r,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(cx+faceSize*0.18,eyeY,r,0,Math.PI*2);ctx.fill();
  }
  const frames=mouthImgs;
  if(frames.length){
    const n=frames.length;
    const targetIdx=Math.min(n-1,Math.max(0,Math.round(mouthLevel*(n-1))));
    const alpha=0.25+(mouthLevel>0.05?0.6:0);
    smoothMouthIdx=smoothMouthIdx*(1-alpha)+targetIdx*alpha;
    const idx=Math.min(n-1,Math.max(0,Math.round(smoothMouthIdx)));
    const mImg=frames[idx];
    if(mImg&&mImg.complete&&mImg.naturalWidth){
      const mw=Math.floor(faceSize*0.55);
      const mh=Math.floor(mw*(mImg.naturalHeight/mImg.naturalWidth));
      const mx=Math.floor((size-mw)/2);
      const my=Math.floor(size*0.52);
      drawTinted(mImg, mx, my, mw, mh);
    }
  }
}
function getLevel(){
  if(!analyser)return 0;
  const data=new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum=0;for(let i=0;i<data.length;i++)sum+=data[i]*data[i];
  const rms=Math.sqrt(sum/data.length)/255;
  const sens=parseFloat(sensSlider&&sensSlider.value)||1.5;
  return Math.min(1,rms*sens*2.2);
}
function animate(){
  if(!isPlaying)return;
  currentLevel=getLevel();
  drawFace(currentLevel);
  if(visCtx&&analyser){
    const data=new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    visCtx.fillStyle="#0a0a0a";visCtx.fillRect(0,0,visCanvas.width,visCanvas.height);
    const barW=visCanvas.width/data.length;
    for(let i=0;i<data.length;i++){
      const h=(data[i]/255)*visCanvas.height;
      visCtx.fillStyle="#7c3aed";
      visCtx.fillRect(i*barW,visCanvas.height-h,barW-1,h);
    }
  }
  if(progressFill&&mediaElement&&mediaElement.duration){
    progressFill.style.width=((mediaElement.currentTime/mediaElement.duration)*100)+"%";
  }
  animId=requestAnimationFrame(animate);
}
audioInput.onchange=async(e)=>{
  const file=e.target.files&&e.target.files[0];
  if(!file)return;
  statusEl.textContent="Loading...";playBtn.disabled=true;
  try{
    if(mediaObjectUrl)URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl=URL.createObjectURL(file);
    if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended")await audioCtx.resume();
    useMediaElement=/video|mp4|webm|mov/i.test(file.type)||/\.(mp4|webm|mov)$/i.test(file.name);
    if(useMediaElement){
      mediaElement=document.createElement(file.type.startsWith("video")?"video":"audio");
      mediaElement.src=mediaObjectUrl;mediaElement.crossOrigin="anonymous";
      await new Promise((res,rej)=>{mediaElement.onloadedmetadata=res;mediaElement.onerror=rej;});
      source=audioCtx.createMediaElementSource(mediaElement);
    } else {
      const ab=await file.arrayBuffer();
      audioBuffer=await audioCtx.decodeAudioData(ab);
      useMediaElement=false;mediaElement=null;
    }
    analyser=audioCtx.createAnalyser();analyser.fftSize=256;
    analyser.smoothingTimeConstant=parseFloat(smoothSlider&&smoothSlider.value)||0.2;
    if(source)source.connect(analyser);
    analyser.connect(audioCtx.destination);
    playBtn.disabled=false;statusEl.textContent="Ready - hit Play";
    if(exportGifBtn)exportGifBtn.disabled=false;
    if(exportVidBtn)exportVidBtn.disabled=false;
  }catch(err){statusEl.textContent="Load failed: "+(err.message||err);console.error(err);}
};
if(sensSlider){const n=document.getElementById("sensNum");sensSlider.oninput=()=>{if(n)n.value=sensSlider.value;};if(n)n.oninput=()=>{sensSlider.value=n.value;};}
if(smoothSlider){const n=document.getElementById("smoothNum");smoothSlider.oninput=()=>{if(n)n.value=smoothSlider.value;if(analyser)analyser.smoothingTimeConstant=parseFloat(smoothSlider.value);};if(n)n.oninput=()=>{smoothSlider.value=n.value;if(analyser)analyser.smoothingTimeConstant=parseFloat(n.value);};}
function startPlay(){
  if(!audioCtx)return;
  if(audioCtx.state==="suspended")audioCtx.resume();
  isPlaying=true;playBtn.disabled=true;statusEl.textContent="Playing...";
  if(useMediaElement&&mediaElement){
    mediaElement.currentTime=0;mediaElement.play();
    mediaElement.onended=()=>{isPlaying=false;playBtn.disabled=false;statusEl.textContent="Finished!";currentLevel=0;drawFace(0);cancelAnimationFrame(animId);};
  } else if(audioBuffer){
    try{if(source)source.disconnect();}catch(_){}
    source=audioCtx.createBufferSource();source.buffer=audioBuffer;source.connect(analyser);source.start(0);
    source.onended=()=>{isPlaying=false;playBtn.disabled=false;statusEl.textContent="Finished!";currentLevel=0;drawFace(0);cancelAnimationFrame(animId);};
  }
  animate();
}
function stopPlay(){
  isPlaying=false;cancelAnimationFrame(animId);
  try{if(source&&source.stop)source.stop();}catch(_){}
  try{if(mediaElement)mediaElement.pause();}catch(_){}
  statusEl.textContent=(audioBuffer||useMediaElement)?"Stopped":"Load audio!";
  currentLevel=0;drawFace(0);
  playBtn.disabled=!(audioBuffer||useMediaElement);
}
playBtn.onclick=startPlay;stopBtn.onclick=stopPlay;
if(exportGifBtn)exportGifBtn.onclick=()=>{statusEl.textContent="GIF export - use Play for now";};
if(exportVidBtn)exportVidBtn.onclick=()=>{statusEl.textContent="Video export - use Play for now";};
buildMouthGrid();loadMouthSet(currentMouthSet);buildGrid();setFaceMode("dark");drawFace(0);
statusEl.textContent="Load audio!";
