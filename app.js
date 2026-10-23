window.FACE_FILES=[];
const DEFAULT_EYES_SRC="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAy0lEQVR42u3bMQ6AIBAEQDH+/8tYWdkqsMfMBzxwOUjE4wAAAAAAAAAAAAAAAAAAAAAAAADW0hKL7r3310Baa7vV8IUr/cWvWF9SEE5NcG9XlYGMWn2rd6GyHSBp4pNqLbcF/Dn51Va/MwACIAAIAAKAACAACAACgAAgAAgAAhDnz8/BiTd+dAAEgAIBSGq/SbWWuRI2atKf51S5HGIL2FyJ/wJmtdxV6gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYKIbLqc0My37ToYAAAAASUVORK5CYII=";
let defaultEyesImg=new Image();
defaultEyesImg.onload=function(){if(typeof drawFace==="function")drawFace(0);};
defaultEyesImg.src=DEFAULT_EYES_SRC;
const FACE_SCALE=1.0;
let mouthImgs=[],currentMouthSet="custom",smoothMouthIdx=0,useSimpleEyes=true;
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
const visCtx=visCanvas.getContext("2d");
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
let isPlaying=false,audioCtx,analyser,source,audioBuffer,currentLevel=0,animId;
let mediaElement=null,mediaObjectUrl=null,useMediaElement=false;
function buildGrid(){
  if(!idleGrid)return;
  idleGrid.innerHTML="";
  const simple=document.createElement("div");
  simple.className="face-thumb active";
  simple.textContent="··";
  simple.title="Bubbly eyes";
  simple.style.cssText="display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;background:#111;border:2px solid #7c3aed";
  simple.onclick=()=>{useSimpleEyes=true;if(!isPlaying)drawFace(0);};
  idleGrid.appendChild(simple);
}
function drawFace(mouthLevel){
  const size=canvas.width;
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle="#000000";
  ctx.fillRect(0,0,size,size);
  const faceSize=Math.floor(size*0.55*FACE_SCALE);
  const y=Math.floor((size-faceSize)/2);
  ctx.imageSmoothingEnabled=false;
  if(defaultEyesImg.complete&&defaultEyesImg.naturalWidth){
    const eyeW=Math.floor(faceSize*0.72);
    const eyeH=Math.floor(eyeW*(defaultEyesImg.naturalHeight/defaultEyesImg.naturalWidth));
    const eyeX0=Math.floor((size-eyeW)/2);
    const eyeY0=y+Math.floor(faceSize*0.05);
    ctx.drawImage(defaultEyesImg,0,0,defaultEyesImg.naturalWidth,defaultEyesImg.naturalHeight,eyeX0,eyeY0,eyeW,eyeH);
  } else {
    const cx=size/2,eyeY=size*0.42,r=Math.max(3,faceSize*0.06);
    ctx.fillStyle="#fff";
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
      const mw=Math.floor(faceSize*0.48);
      const mh=Math.floor(mw*(mImg.naturalHeight/mImg.naturalWidth));
      const mx=Math.floor((size-mw)/2);
      const my=Math.floor(size*0.58);
      ctx.drawImage(mImg,mx,my,mw,mh);
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
    exportGifBtn.disabled=false;exportVidBtn.disabled=false;
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
exportGifBtn.onclick=()=>{statusEl.textContent="GIF export - use Play for now";};
exportVidBtn.onclick=()=>{statusEl.textContent="Video export - use Play for now";};
buildMouthGrid();loadMouthSet(currentMouthSet);buildGrid();drawFace(0);
statusEl.textContent="Load audio!";
