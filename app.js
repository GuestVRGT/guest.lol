window.FACE_FILES = []; // simple eyes only — no face PNGs required
const FACE_SCALE = 1.0;
let mouthImgs = [];
let currentMouthSet = 'custom';

function loadMouthSet(key) {
  const sets = (typeof MOUTH_SETS !== 'undefined') ? MOUTH_SETS : {};
  const set = sets[key] || Object.values(sets)[0] || { frames: [] };
  currentMouthSet = key;
  mouthImgs = (set.frames || []).map(src => { const img = new Image(); img.src = src; return img; });
  const grid = document.getElementById('mouthGrid');
  if (grid) grid.querySelectorAll('.mouth-thumb').forEach(t => t.classList.toggle('active', t.dataset.key === key));
  if (typeof drawFace === 'function') drawFace(0);
}

function buildMouthGrid() {
  const grid = document.getElementById('mouthGrid');
  if (!grid || typeof MOUTH_SETS === 'undefined') return;
  grid.innerHTML = '';
  Object.keys(MOUTH_SETS).forEach(key => {
    const set = MOUTH_SETS[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mouth-thumb' + (key === currentMouthSet ? ' active' : '');
    btn.dataset.key = key;
    btn.title = set.name;
    const preview = document.createElement('img');
    const frames = set.frames || [];
    preview.src = frames[0] || '';
    btn.appendChild(preview);
    const label = document.createElement('span');
    label.textContent = set.name;
    btn.appendChild(label);
    btn.onclick = () => loadMouthSet(key);
    grid.appendChild(btn);
  });
}

const canvas = document.getElementById('faceCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const visCanvas = document.getElementById('visCanvas');
const visCtx = visCanvas.getContext('2d');
const idleGrid = document.getElementById('idleGrid');
const audioInput = document.getElementById('audioInput');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const exportGifBtn = document.getElementById('exportGifBtn');
const exportVidBtn = document.getElementById('exportVidBtn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const sensSlider = document.getElementById('sens');
const smoothSlider = document.getElementById('smooth');
const fpsSlider = document.getElementById('gifFps');
const faceSearch = document.getElementById('faceSearch');

let selectedFace = null;
let idleImg = new Image();
let isPlaying = false;
let isExporting = false;
let audioCtx, analyser, source, audioBuffer;
let currentLevel = 0;
let animId;
let mediaRecorder = null;
let recordedChunks = [];
let mediaElement = null;
let mediaObjectUrl = null;
let useMediaElement = false;
const faceImgs = {};
let FACE_DATA = {};
let smoothMouthIdx = 0;
const FACES_DIR = 'faces/';
let useSimpleEyes = true;

function displayName(filename) { return filename.replace(/\.png$/i, ''); }
function faceUrl(filename) {
  if (FACE_DATA[filename]) return FACE_DATA[filename];
  return FACES_DIR + encodeURIComponent(filename);
}
function loadFace(filename) {
  return new Promise((resolve) => {
    if (faceImgs[filename] && faceImgs[filename].complete && faceImgs[filename].naturalWidth) {
      resolve(faceImgs[filename]); return;
    }
    const img = new Image();
    img.onload = () => { faceImgs[filename] = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = faceUrl(filename);
  });
}
function buildGrid(filter = '') {
  if (!idleGrid) return;
  idleGrid.innerHTML = '';
  const q = (filter || '').trim().toLowerCase();
  const list = (typeof FACE_FILES !== 'undefined' && FACE_FILES.length ? FACE_FILES : []).filter(f => !q || displayName(f).toLowerCase().includes(q));
  const countEl = document.getElementById('faceCount');
  if (countEl) countEl.textContent = list.length ? '(' + list.length + ')' : '';
  const simple = document.createElement('div');
  simple.className = 'face-thumb' + (useSimpleEyes ? ' active' : '');
  simple.textContent = '··';
  simple.title = 'Simple dots';
  simple.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;background:#111;border:2px solid ' + (useSimpleEyes ? '#7c3aed' : 'transparent');
  simple.onclick = () => {
    useSimpleEyes = true;
    selectedFace = null;
    idleImg = new Image();
    if (!isPlaying) drawFace(0);
    buildGrid();
  };
  idleGrid.appendChild(simple);
  list.forEach(name => {
    const img = document.createElement('img');
    img.className = 'face-thumb' + (!useSimpleEyes && name === selectedFace ? ' active' : '');
    img.src = faceUrl(name);
    img.title = displayName(name);
    img.onclick = () => {
      useSimpleEyes = false;
      selectedFace = name;
      loadFace(name).then(im => { idleImg = im || new Image(); if (!isPlaying) drawFace(0); });
      buildGrid();
    };
    idleGrid.appendChild(img);
  });
}
if (faceSearch) faceSearch.oninput = () => buildGrid(faceSearch.value);

function drawSimpleEyes(cx, eyeY, faceSize) {
  const r = Math.max(3, faceSize * 0.06);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx - faceSize * 0.18, eyeY, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + faceSize * 0.18, eyeY, r, 0, Math.PI * 2); ctx.fill();
}

function drawFace(mouthLevel) {
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  const faceSize = Math.floor(size * 0.55 * FACE_SCALE);
  const x = Math.floor((size - faceSize) / 2);
  const y = Math.floor((size - faceSize) / 2);
  const cx = size / 2;
  const eyeY = size * 0.42;
  ctx.imageSmoothingEnabled = false;
  if (useSimpleEyes || !idleImg || !idleImg.complete || !idleImg.naturalWidth) {
    drawSimpleEyes(cx, eyeY, faceSize);
  } else {
    const eyeRatio = 0.55;
    const srcW = idleImg.naturalWidth, srcH = idleImg.naturalHeight;
    const srcEyeH = Math.floor(srcH * eyeRatio);
    const eyeH = Math.floor(faceSize * eyeRatio);
    const off = document.createElement('canvas');
    off.width = faceSize; off.height = eyeH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(idleImg, 0, 0, srcW, srcEyeH, 0, 0, faceSize, eyeH);
    try {
      const id = octx.getImageData(0, 0, faceSize, eyeH);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 20) continue;
        const lum = (d[i] + d[i+1] + d[i+2]) / 3;
        const v = lum < 140 ? 255 : 0;
        d[i] = d[i+1] = d[i+2] = v;
        d[i+3] = 255;
      }
      octx.putImageData(id, 0, 0);
    } catch (_) {}
    ctx.drawImage(off, x, y + Math.floor(faceSize * 0.08));
  }
  const frames = mouthImgs;
  if (frames.length) {
    let idx = 0;
    const talking = (isPlaying || isExporting) && mouthLevel > 0.03;
    if (talking && frames.length > 1) {
      const openCount = frames.length - 1;
      const curved = Math.pow(Math.min(1, mouthLevel), 0.65);
      const openIdx = Math.max(0, Math.min(openCount - 1, Math.round(curved * (openCount - 1))));
      const target = 1 + openIdx;
      smoothMouthIdx += (target - smoothMouthIdx) * 0.85;
      idx = Math.max(1, Math.min(frames.length - 1, Math.round(smoothMouthIdx)));
    } else {
      smoothMouthIdx *= 0.25;
      idx = 0;
    }
    const mouth = frames[idx];
    if (mouth && mouth.complete && mouth.naturalWidth) {
      const mouthSize = faceSize;
      const mx = Math.floor((size - mouthSize) / 2);
      const my = Math.floor(size * 0.28);
      ctx.drawImage(mouth, mx, my, mouthSize, mouthSize);
    }
  }
}

const sensNum = document.getElementById('sensNum');
const smoothNum = document.getElementById('smoothNum');
const fpsNum = document.getElementById('fpsNum');
function syncSens(fromSlider) {
  if (fromSlider) sensNum.value = sensSlider.value;
  else { let v = parseFloat(sensNum.value); if (isNaN(v)) v = 1.5; v = Math.max(0.1, Math.min(10, v)); sensNum.value = v; sensSlider.value = v; }
}
function syncSmooth(fromSlider) {
  if (fromSlider) smoothNum.value = smoothSlider.value;
  else { let v = parseFloat(smoothNum.value); if (isNaN(v)) v = 0.2; v = Math.max(0, Math.min(0.95, v)); smoothNum.value = v; smoothSlider.value = v; }
}
function syncFps(fromSlider) {
  if (fromSlider) fpsNum.value = fpsSlider.value;
  else { let v = parseInt(fpsNum.value, 10); if (isNaN(v)) v = 12; v = Math.max(1, Math.min(30, v)); fpsNum.value = v; fpsSlider.value = v; }
}
sensSlider.oninput = () => syncSens(true);
smoothSlider.oninput = () => syncSmooth(true);
fpsSlider.oninput = () => syncFps(true);
sensNum.onchange = sensNum.oninput = () => syncSens(false);
smoothNum.onchange = smoothNum.oninput = () => syncSmooth(false);
fpsNum.onchange = fpsNum.oninput = () => syncFps(false);

function getLevel() {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0, peak = 0;
  for (let i = 0; i < data.length; i++) { sum += data[i]; if (data[i] > peak) peak = data[i]; }
  const rms = sum / data.length / 255;
  const pk = peak / 255;
  const sens = parseFloat(sensSlider.value) || 1.5;
  return Math.min(1, (rms * 0.6 + pk * 0.4) * sens);
}

function animate() {
  if (!isPlaying && !isExporting) return;
  currentLevel = getLevel();
  drawFace(currentLevel);
  if (visCtx && analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    visCtx.fillStyle = '#f3f0fa';
    visCtx.fillRect(0, 0, visCanvas.width, visCanvas.height);
    const barW = visCanvas.width / 32;
    for (let i = 0; i < 32; i++) {
      const h = (data[i * 4] / 255) * visCanvas.height;
      visCtx.fillStyle = '#7c3aed';
      visCtx.fillRect(i * barW, visCanvas.height - h, barW - 1, h);
    }
  }
  animId = requestAnimationFrame(animate);
}

audioInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  statusEl.textContent = 'Loading…';
  if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
  if (audioCtx) { try { audioCtx.close(); } catch(_){} }
  audioBuffer = null; useMediaElement = false; mediaElement = null;
  try {
    const ab = await file.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    statusEl.textContent = 'Ready — hit Play';
    playBtn.disabled = false;
    exportGifBtn.disabled = false;
    exportVidBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = 'Decode failed, trying media element…';
    mediaObjectUrl = URL.createObjectURL(file);
    mediaElement = new Audio(mediaObjectUrl);
    mediaElement.crossOrigin = 'anonymous';
    useMediaElement = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(mediaElement);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    statusEl.textContent = 'Ready (media) — hit Play';
    playBtn.disabled = false;
  }
};

function startPlay() {
  if (isPlaying) return;
  isPlaying = true;
  playBtn.disabled = true;
  statusEl.textContent = 'Playing…';
  if (useMediaElement && mediaElement) {
    mediaElement.currentTime = 0;
    mediaElement.play();
    mediaElement.onended = () => { isPlaying = false; playBtn.disabled = false; statusEl.textContent = 'Finished!'; currentLevel = 0; drawFace(0); cancelAnimationFrame(animId); };
  } else if (audioBuffer) {
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start(0);
    source.onended = () => { isPlaying = false; playBtn.disabled = false; statusEl.textContent = 'Finished!'; currentLevel = 0; drawFace(0); cancelAnimationFrame(animId); };
  }
  animate();
}

function stopPlay() {
  isPlaying = false;
  cancelAnimationFrame(animId);
  try { if (source) source.stop(); } catch(_){}
  try { if (mediaElement) mediaElement.pause(); } catch(_){}
  if (!isExporting) { statusEl.textContent = (audioBuffer || useMediaElement) ? 'Stopped' : 'Load audio!'; currentLevel = 0; drawFace(0); }
  playBtn.disabled = !(audioBuffer || useMediaElement);
}

playBtn.onclick = startPlay;
stopBtn.onclick = stopPlay;

exportGifBtn.onclick = () => { statusEl.textContent = 'GIF export — use Play for now'; };
exportVidBtn.onclick = () => { statusEl.textContent = 'Video export — use Play for now'; };

buildMouthGrid();
loadMouthSet(currentMouthSet);
buildGrid();
drawFace(0);
statusEl.textContent = 'Load audio!';
