window.FACE_FILES=[];
// eyes come from eyes_data.js
let defaultEyesImg = new Image();
defaultEyesImg.onload = function(){ if(typeof drawFace==="function") drawFace(0); };
if(typeof window.DEFAULT_EYES_SRC !== "undefined") defaultEyesImg.src = window.DEFAULT_EYES_SRC;

const FACE_SCALE = 1.0;
let mouthImgs = [], currentMouthSet = "custom", smoothMouthIdx = 0;
let faceMode = "dark";
let isExporting = false;
let recordedChunks = [];
let mediaRecorder = null;

function loadMouthSet(key){
  const sets = (typeof MOUTH_SETS !== "undefined") ? MOUTH_SETS : {};
  const set = sets[key] || Object.values(sets)[0] || {frames:[]};
  currentMouthSet = key;
  mouthImgs = (set.frames || []).map(src => {
    const img = new Image();
    img.onload = () => { if(typeof drawFace==="function") drawFace(0); };
    img.src = src || "";
    return img;
  });
  const grid = document.getElementById("mouthGrid");
  if(grid) grid.querySelectorAll(".mouth-thumb").forEach(t => t.classList.toggle("active", t.dataset.key === key));
  if(typeof drawFace === "function") drawFace(0);
}

function buildMouthGrid(){
  const grid = document.getElementById("mouthGrid");
  if(!grid || typeof MOUTH_SETS === "undefined") return;
  grid.innerHTML = "";
  Object.keys(MOUTH_SETS).forEach(key => {
    const set = MOUTH_SETS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mouth-thumb" + (key === currentMouthSet ? " active" : "");
    btn.dataset.key = key;
    btn.title = set.name;
    const preview = document.createElement("img");
    preview.src = (set.frames || [])[0] || "";
    btn.appendChild(preview);
    const label = document.createElement("span");
    label.textContent = set.name;
    btn.appendChild(label);
    btn.onclick = () => loadMouthSet(key);
    grid.appendChild(btn);
  });
}

const canvas = document.getElementById("faceCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;
if (canvas.width < 512) { canvas.width = 512; canvas.height = 512; }

const visCanvas = document.getElementById("visCanvas");
const visCtx = visCanvas ? visCanvas.getContext("2d") : null;
const idleGrid = document.getElementById("idleGrid");
const audioInput = document.getElementById("audioInput");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const exportVidBtn = document.getElementById("exportVidBtn");
const statusEl = document.getElementById("status");
const progressFill = document.getElementById("progressFill");
const progressBar = document.getElementById("progressBar");
const sensSlider = document.getElementById("sens");
const smoothSlider = document.getElementById("smooth");
const stageEl = document.getElementById("stage");
let isPlaying = false, audioCtx, analyser, source, audioBuffer, currentLevel = 0, animId;
let mediaElement = null, mediaObjectUrl = null, useMediaElement = false;

function setFaceMode(mode){
  faceMode = mode === "light" ? "light" : "dark";
  document.querySelectorAll(".face-mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === faceMode);
    b.style.borderColor = b.dataset.mode === faceMode ? "#7c3aed" : "transparent";
  });
  if(stageEl){
    stageEl.style.backgroundColor = faceMode === "dark" ? "#000000" : "#ffffff";
    stageEl.style.borderColor = faceMode === "dark" ? "#222" : "#ddd";
  }
  if(!isPlaying) drawFace(0);
}

function buildGrid(){
  if(!idleGrid) return;
  idleGrid.innerHTML = "";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;width:100%;grid-column:1/-1;";
  [["dark","Black face"],["light","White face"]].forEach(([mode,label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "face-mode-btn" + (faceMode === mode ? " active" : "");
    btn.dataset.mode = mode;
    btn.textContent = label;
    btn.style.cssText = "flex:1;padding:10px;border-radius:12px;font-weight:800;font-size:0.85rem;cursor:pointer;border:2px solid " + (faceMode===mode?"#7c3aed":"transparent") + ";background:" + (mode==="dark"?"#111":"#f3f0fa") + ";color:" + (mode==="dark"?"#fff":"#1e1b2e");
    btn.onclick = () => setFaceMode(mode);
    row.appendChild(btn);
  });
  idleGrid.appendChild(row);
}

function drawTinted(img, dx, dy, dw, dh){
  if(faceMode === "dark"){
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const off = document.createElement("canvas");
  off.width = img.naturalWidth || img.width;
  off.height = img.naturalHeight || img.height;
  const o = off.getContext("2d");
  o.imageSmoothingEnabled = false;
  o.drawImage(img, 0, 0);
  try {
    const id = o.getImageData(0,0,off.width,off.height);
    const d = id.data;
    for(let i=0; i<d.length; i+=4){
      if(d[i+3] < 20){ d[i+3]=0; continue; }
      d[i] = d[i+1] = d[i+2] = 0;
      d[i+3] = 255;
    }
    o.putImageData(id, 0, 0);
  } catch(_){}
  ctx.drawImage(off, dx, dy, dw, dh);
}

function drawFace(mouthLevel){
  const size = canvas.width;
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle = faceMode === "dark" ? "#000000" : "#ffffff";
  ctx.fillRect(0,0,size,size);
  ctx.imageSmoothingEnabled = false;
  const contentW = Math.floor(size * 0.72);
  const eyeY0 = Math.floor(size * 0.22);
  const mouthY = Math.floor(size * 0.52);
  if(defaultEyesImg.complete && defaultEyesImg.naturalWidth){
    const eyeW = contentW;
    const eyeH = Math.floor(eyeW * (defaultEyesImg.naturalHeight / defaultEyesImg.naturalWidth));
    const eyeX0 = Math.floor((size - eyeW) / 2);
    drawTinted(defaultEyesImg, eyeX0, eyeY0, eyeW, eyeH);
  }
  const frames = mouthImgs;
  if(frames.length){
    const n = frames.length;
    const targetIdx = Math.min(n-1, Math.max(0, Math.round(mouthLevel * (n-1))));
    const alpha = 0.28 + (mouthLevel > 0.04 ? 0.55 : 0);
    smoothMouthIdx = smoothMouthIdx * (1 - alpha) + targetIdx * alpha;
    const idx = Math.min(n-1, Math.max(0, Math.round(smoothMouthIdx)));
    const mImg = frames[idx];
    if(mImg && mImg.complete && mImg.naturalWidth){
      const mw = Math.floor(contentW * 0.92);
      const mh = Math.floor(mw * (mImg.naturalHeight / mImg.naturalWidth));
      const mx = Math.floor((size - mw) / 2);
      const my = mouthY;
      drawTinted(mImg, mx, my, mw, mh);
    }
  }
}

function getLevel(){
  if(!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for(let i=0; i<data.length; i++) sum += data[i]*data[i];
  const rms = Math.sqrt(sum / data.length) / 255;
  const sens = parseFloat(sensSlider && sensSlider.value) || 1.5;
  return Math.min(1, rms * sens * 2.2);
}

function animate(){
  if(!isPlaying) return;
  currentLevel = getLevel();
  drawFace(currentLevel);
  if(visCtx && analyser){
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    visCtx.fillStyle = "#0a0a0a";
    visCtx.fillRect(0,0,visCanvas.width,visCanvas.height);
    const barW = visCanvas.width / data.length;
    for(let i=0; i<data.length; i++){
      const h = (data[i]/255) * visCanvas.height;
      visCtx.fillStyle = "#7c3aed";
      visCtx.fillRect(i*barW, visCanvas.height - h, barW-1, h);
    }
  }
  if(progressFill && mediaElement && mediaElement.duration && !isExporting){
    progressFill.style.width = ((mediaElement.currentTime / mediaElement.duration)*100) + "%";
  }
  animId = requestAnimationFrame(animate);
}

function setExportingUI(on) {
  isExporting = on;
  const hasMedia = !!(audioBuffer || useMediaElement);
  playBtn.disabled = on || !hasMedia;
  if (exportVidBtn) exportVidBtn.disabled = on || !audioBuffer;
  if (progressBar) progressBar.style.display = on ? "block" : "none";
  if (!on && progressFill) progressFill.style.width = "0%";
}

audioInput.onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  statusEl.textContent = "Loading...";
  playBtn.disabled = true;
  if (exportVidBtn) exportVidBtn.disabled = true;
  try {
    if(mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = URL.createObjectURL(file);
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === "suspended") await audioCtx.resume();
    const ab = await file.arrayBuffer();
    try {
      audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
    } catch (decodeErr) {
      audioBuffer = null;
      console.warn("decodeAudioData failed", decodeErr);
    }
    useMediaElement = /video|mp4|webm|mov/i.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
    if(useMediaElement){
      mediaElement = document.createElement(file.type.startsWith("video") ? "video" : "audio");
      mediaElement.src = mediaObjectUrl;
      mediaElement.crossOrigin = "anonymous";
      await new Promise((res,rej) => { mediaElement.onloadedmetadata = res; mediaElement.onerror = rej; });
      source = audioCtx.createMediaElementSource(mediaElement);
    } else {
      useMediaElement = false;
      mediaElement = null;
    }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = parseFloat(smoothSlider && smoothSlider.value) || 0.2;
    if(source) source.connect(analyser);
    analyser.connect(audioCtx.destination);
    playBtn.disabled = false;
    if (exportVidBtn) exportVidBtn.disabled = !audioBuffer;
    statusEl.textContent = audioBuffer
      ? "Ready — Play or Export MP4"
      : "Ready to Play (export needs a normal audio track)";
  } catch(err) {
    statusEl.textContent = "Load failed: " + (err.message || err);
    console.error(err);
  }
};

playBtn.onclick = async () => {
  if(!analyser && !audioBuffer) return;
  if(audioCtx.state === "suspended") await audioCtx.resume();
  isPlaying = true;
  playBtn.disabled = true;
  if(useMediaElement && mediaElement){
    mediaElement.currentTime = 0;
    mediaElement.play();
    mediaElement.onended = () => { isPlaying = false; playBtn.disabled = false; drawFace(0); };
  } else if(audioBuffer){
    if(source) try{source.disconnect();}catch(_){}
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = parseFloat(smoothSlider && smoothSlider.value) || 0.2;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start(0);
    source.onended = () => { isPlaying = false; playBtn.disabled = false; drawFace(0); };
  }
  animate();
};

stopBtn.onclick = () => {
  isPlaying = false;
  playBtn.disabled = false;
  if(animId) cancelAnimationFrame(animId);
  if(mediaElement){ mediaElement.pause(); mediaElement.currentTime = 0; }
  if(source && source.stop) try{source.stop();}catch(_){}
  if(mediaRecorder && mediaRecorder.state === "recording") try{mediaRecorder.stop();}catch(_){}
  drawFace(0);
  if(progressFill) progressFill.style.width = "0%";
  if (isExporting) setExportingUI(false);
};

if(sensSlider){
  sensSlider.oninput = () => { const n = document.getElementById("sensNum"); if(n) n.value = sensSlider.value; };
  const sensNum = document.getElementById("sensNum");
  if(sensNum) sensNum.onchange = () => { sensSlider.value = sensNum.value; };
}
if(smoothSlider){
  smoothSlider.oninput = () => {
    const n = document.getElementById("smoothNum"); if(n) n.value = smoothSlider.value;
    if(analyser) analyser.smoothingTimeConstant = parseFloat(smoothSlider.value) || 0.2;
  };
  const smoothNum = document.getElementById("smoothNum");
  if(smoothNum) smoothNum.onchange = () => { smoothSlider.value = smoothNum.value; if(analyser) analyser.smoothingTimeConstant = parseFloat(smoothNum.value)||0.2; };
}

function pickRecorderMime() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  for (const t of types) {
    try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch (_) {}
  }
  return "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function convertWebmToMp4(webmBlob) {
  statusEl.textContent = "Converting to MP4 (first run may take a bit)…";
  if (!window.FFmpegWASM) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load MP4 converter"));
      document.head.appendChild(s);
    });
  }
  if (!window.FFmpegUtil) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/util.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load converter util"));
      document.head.appendChild(s);
    });
  }
  const { FFmpeg } = window.FFmpegWASM;
  const { toBlobURL } = window.FFmpegUtil;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    if (progressFill) progressFill.style.width = Math.min(99, 70 + progress * 28) + "%";
    statusEl.textContent = "Encoding MP4… " + Math.round((progress || 0) * 100) + "%";
  });
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(base + "/ffmpeg-core.js", "text/javascript"),
    wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm")
  });
  const data = new Uint8Array(await webmBlob.arrayBuffer());
  await ffmpeg.writeFile("in.webm", data);
  await ffmpeg.exec([
    "-i", "in.webm",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "out.mp4"
  ]);
  const out = await ffmpeg.readFile("out.mp4");
  return new Blob([out.buffer], { type: "video/mp4" });
}

if (exportVidBtn) exportVidBtn.onclick = async () => {
  if (isExporting) return;
  try {
    if (!audioBuffer) {
      statusEl.textContent = "Load a file with a decodable audio track first.";
      return;
    }
    if (!window.MediaRecorder) {
      statusEl.textContent = "Recording is not supported in this browser.";
      return;
    }
    setExportingUI(true);
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    statusEl.textContent = "Recording high-quality video…";
    const dest = audioCtx.createMediaStreamDestination();
    if (source) try { source.disconnect(); } catch (_) {}
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = parseFloat(smoothSlider && smoothSlider.value) || 0.25;
    source.connect(analyser);
    analyser.connect(dest);
    const silent = audioCtx.createGain();
    silent.gain.value = 0.0001;
    analyser.connect(silent);
    silent.connect(audioCtx.destination);

    const fps = 30;
    const canvasStream = canvas.captureStream(fps);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mime = pickRecorderMime();
    const nativeMp4 = mime.includes("mp4");
    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(combined, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 12000000,
        audioBitsPerSecond: 192000
      });
    } catch (_) {
      mediaRecorder = new MediaRecorder(combined);
    }

    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
    const stopped = new Promise((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.onerror = () => resolve();
    });

    mediaRecorder.start(100);
    isPlaying = true;
    const startT = audioCtx.currentTime;
    const dur = audioBuffer.duration;

    const tick = () => {
      if (!isExporting) return;
      currentLevel = getLevel();
      drawFace(currentLevel);
      if (progressFill) progressFill.style.width = Math.min(100, ((audioCtx.currentTime - startT) / dur) * 100) + "%";
      if (isPlaying) requestAnimationFrame(tick);
    };

    source.onended = () => {
      isPlaying = false;
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
      }, 220);
    };
    source.start(0);
    tick();
    await stopped;

    let blob = new Blob(recordedChunks, { type: mime || "video/webm" });
    let filename = "guest-lol-lipsync.mp4";

    if (!nativeMp4) {
      try {
        blob = await convertWebmToMp4(blob);
      } catch (convErr) {
        console.warn(convErr);
        filename = "guest-lol-lipsync.webm";
        statusEl.textContent = "MP4 convert failed — saved WebM instead. " + (convErr.message || "");
        downloadBlob(blob, filename);
        setExportingUI(false);
        currentLevel = 0;
        drawFace(0);
        isPlaying = false;
        return;
      }
    }

    downloadBlob(blob, filename);
    statusEl.textContent = "MP4 downloaded! (" + (blob.size / 1024 / 1024).toFixed(1) + " MB)";
    setExportingUI(false);
    currentLevel = 0;
    drawFace(0);
    isPlaying = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Export failed: " + (err.message || err);
    setExportingUI(false);
    isPlaying = false;
  }
};

buildMouthGrid();
loadMouthSet(currentMouthSet);
buildGrid();
setFaceMode("dark");
drawFace(0);
statusEl.textContent = "Load audio!";
