const FACE_SCALE = 1.15;
const mouthImgs = (typeof MOUTH_FRAMES !== 'undefined' ? MOUTH_FRAMES : []).map(src => {
  const img = new Image();
  img.src = src;
  return img;
});
const FACES_DIR = 'faces/';
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
const mouthSlider = document.getElementById('mouthSize');
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
function displayName(filename) {
  return filename.replace(/\.png$/i, '');
}
function faceUrl(filename) {
  if (FACE_DATA[filename]) return FACE_DATA[filename];
  return FACES_DIR + encodeURIComponent(filename);
}
function loadFace(filename) {
  return new Promise((resolve) => {
    if (faceImgs[filename] && faceImgs[filename].complete && faceImgs[filename].naturalWidth) {
      resolve(faceImgs[filename]);
      return;
    }
    const img = new Image();
    img.onload = () => { faceImgs[filename] = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = faceUrl(filename);
  });
}
function buildGrid(filter = '') {
  idleGrid.innerHTML = '';
  const q = filter.trim().toLowerCase();
  const list = (typeof FACE_FILES !== 'undefined' ? FACE_FILES : []).filter(f => !q || displayName(f).toLowerCase().includes(q));
  document.getElementById('faceCount').textContent = '(' + list.length + ')';
  list.forEach(name => {
    const img = document.createElement('img');
    img.className = 'face-thumb' + (name === selectedFace ? ' active' : '');
    img.src = faceUrl(name);
    img.title = displayName(name);
    img.loading = 'lazy';
    img.onclick = async () => {
      if (isExporting) return;
      document.querySelectorAll('.face-thumb').forEach(t => t.classList.remove('active'));
      img.classList.add('active');
      selectedFace = name;
      idleImg = await loadFace(name);
      if (!isPlaying) drawFace(0);
      statusEl.textContent = 'Eyes: ' + displayName(name);
    };
    idleGrid.appendChild(img);
  });
}
faceSearch.oninput = () => buildGrid(faceSearch.value);
async function loadFaces() {
  statusEl.textContent = 'Loading faces...';
  const list = (typeof FACE_FILES !== 'undefined' && Array.isArray(FACE_FILES)) ? FACE_FILES.slice() : [];
  if (!list.length) {
    statusEl.textContent = 'No faces listed — check face_list.js';
    return;
  }
  FACE_DATA = {};
  statusEl.textContent = 'Loaded ' + list.length + ' faces from faces/';
  buildGrid();
  const prefer = ['Optimist.png', 'Awesome Face.png', 'smile.png', 'Winning Smile.png'];
  selectedFace = prefer.find(p => list.includes(p)) || list[0];
  idleImg = await loadFace(selectedFace);
  drawFace(0);
  idleGrid.querySelectorAll('.face-thumb').forEach(t => {
    if (t.title === displayName(selectedFace)) t.classList.add('active');
  });
}
loadFaces();
let smoothMouthIdx = 0;
function drawFace(mouthLevel) {
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f3f0fa';
  ctx.fillRect(0, 0, size, size);
  const faceSize = Math.floor(size * 0.82 * FACE_SCALE);
  const x = Math.floor((size - faceSize) / 2);
  const y = Math.floor((size - faceSize) / 2);
  ctx.imageSmoothingEnabled = false;
  const eyeRatio = 0.52;
  if (idleImg && idleImg.complete && idleImg.naturalWidth) {
    const srcW = idleImg.naturalWidth;
    const srcH = idleImg.naturalHeight;
    const srcEyeH = Math.floor(srcH * eyeRatio);
    const eyeH = Math.floor(faceSize * eyeRatio);
    ctx.drawImage(idleImg, 0, 0, srcW, srcEyeH, x, y, faceSize, eyeH);
  }
  const frames = mouthImgs;
  if (frames.length) {
    let idx = 0;
    const talking = (isPlaying || isExporting) && mouthLevel > 0.04;
    if (talking && frames.length > 1) {
      const openCount = frames.length - 1;
      const openIdx = Math.max(0, Math.min(openCount - 1, Math.round(mouthLevel * (openCount - 1))));
      const target = 1 + openIdx;
      smoothMouthIdx += (target - smoothMouthIdx) * 0.7;
      idx = Math.max(1, Math.min(frames.length - 1, Math.round(smoothMouthIdx)));
    } else {
      smoothMouthIdx *= 0.4;
      idx = smoothMouthIdx < 0.5 ? 0 : Math.max(0, Math.round(smoothMouthIdx));
    }
    const mouth = frames[idx];
    if (mouth && mouth.complete && mouth.naturalWidth) {
      ctx.drawImage(mouth, x, y, faceSize, faceSize);
    }
  }
  const grad = ctx.createRadialGradient(size/2, size/2, size*0.28, size/2, size/2, size*0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}
function setExportingUI(on) {
  isExporting = on;
  const hasMedia = !!(audioBuffer || useMediaElement);
  playBtn.disabled = on || !hasMedia;
  exportGifBtn.disabled = on || !audioBuffer;
  exportVidBtn.disabled = on || !audioBuffer;
  progressBar.style.display = on ? 'block' : 'none';
  if (!on) progressFill.style.width = '0%';
}
const sensNum = document.getElementById('sensNum');
const smoothNum = document.getElementById('smoothNum');
const fpsNum = document.getElementById('fpsNum');
const mouthNum = document.getElementById('mouthNum');
function syncSens(fromSlider) {
  if (fromSlider) sensNum.value = sensSlider.value;
  else {
    let v = parseFloat(sensNum.value);
    if (isNaN(v)) v = 1.5;
    v = Math.max(0.1, Math.min(10, v));
    sensNum.value = v;
    sensSlider.value = v;
  }
}
function syncSmooth(fromSlider) {
  if (fromSlider) smoothNum.value = smoothSlider.value;
  else {
    let v = parseFloat(smoothNum.value);
    if (isNaN(v)) v = 0.2;
    v = Math.max(0, Math.min(0.95, v));
    smoothNum.value = v;
    smoothSlider.value = v;
  }
}
function syncFps(fromSlider) {
  if (fromSlider) fpsNum.value = fpsSlider.value;
  else {
    let v = parseInt(fpsNum.value, 10);
    if (isNaN(v)) v = 12;
    v = Math.max(1, Math.min(30, v));
    fpsNum.value = v;
    fpsSlider.value = v;
  }
}
function syncMouth(fromSlider) {
  if (fromSlider) mouthNum.value = mouthSlider.value;
  else {
    let v = parseFloat(mouthNum.value);
    if (isNaN(v)) v = 1;
    v = Math.max(0.3, Math.min(2, v));
    mouthNum.value = v;
    mouthSlider.value = v;
  }
}
sensSlider.oninput = () => syncSens(true);
smoothSlider.oninput = () => syncSmooth(true);
fpsSlider.oninput = () => syncFps(true);
mouthSlider.oninput = () => syncMouth(true);
sensNum.onchange = sensNum.oninput = () => syncSens(false);
smoothNum.onchange = smoothNum.oninput = () => syncSmooth(false);
fpsNum.onchange = fpsNum.oninput = () => syncFps(false);
mouthNum.onchange = mouthNum.oninput = () => syncMouth(false);
audioInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  statusEl.textContent = 'Loading...';
  playBtn.disabled = true; exportGifBtn.disabled = true; exportVidBtn.disabled = true;
  audioBuffer = null;
  useMediaElement = false;
  if (mediaObjectUrl) { URL.revokeObjectURL(mediaObjectUrl); mediaObjectUrl = null; }
  if (mediaElement) { mediaElement.pause(); mediaElement.src = ''; mediaElement = null; }
  try {
    if (audioCtx) { try { await audioCtx.close(); } catch(_){} }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ab = await file.arrayBuffer();
    try {
      audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
      useMediaElement = false;
      statusEl.textContent = 'Ready: ' + file.name + ' (' + audioBuffer.duration.toFixed(1) + 's)';
      playBtn.disabled = false; exportGifBtn.disabled = false; exportVidBtn.disabled = false;
      return;
    } catch (decodeErr) { console.warn('decodeAudioData failed', decodeErr); }
    mediaObjectUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    mediaElement = document.createElement(isVideo ? 'video' : 'audio');
    mediaElement.preload = 'auto';
    mediaElement.src = mediaObjectUrl;
    mediaElement.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      mediaElement.onloadedmetadata = () => resolve();
      mediaElement.onerror = () => reject(new Error('Could not load media'));
      setTimeout(() => reject(new Error('Media load timeout')), 15000);
    });
    useMediaElement = true;
    const dur = mediaElement.duration;
    if (!isFinite(dur) || dur <= 0) throw new Error('Unknown duration');
    statusEl.textContent = 'Ready: ' + file.name + ' (' + dur.toFixed(1) + 's)';
    playBtn.disabled = false;
    exportGifBtn.disabled = false;
    exportVidBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = 'Error loading file — try mp3/wav/mp4';
    console.error(err);
  }
});
playBtn.onclick = () => { if ((!audioBuffer && !useMediaElement) || isPlaying || isExporting) return; startPlay(); };
stopBtn.onclick = () => {
  if (isExporting && mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  stopPlay();
};
async function startPlay() {
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.12;
  if (useMediaElement && mediaElement) {
    const srcUrl = mediaElement.src;
    const tag = mediaElement.tagName;
    mediaElement.pause();
    mediaElement = document.createElement(tag === 'VIDEO' ? 'video' : 'audio');
    mediaElement.src = srcUrl;
    mediaElement.preload = 'auto';
    await new Promise(r => { mediaElement.onloadedmetadata = r; mediaElement.onerror = r; });
    mediaElement.currentTime = 0;
    const mes = audioCtx.createMediaElementSource(mediaElement);
    mes.connect(analyser);
    analyser.connect(audioCtx.destination);
    source = { stop: () => { try { mediaElement.pause(); mediaElement.currentTime = 0; } catch(_){} } };
    mediaElement.onended = () => {
      isPlaying = false; playBtn.disabled = false;
      statusEl.textContent = 'Finished!';
      currentLevel = 0; drawFace(0); cancelAnimationFrame(animId);
    };
    await mediaElement.play();
  } else {
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.onended = () => {
      isPlaying = false; playBtn.disabled = false;
      statusEl.textContent = 'Finished!';
      currentLevel = 0; drawFace(0); cancelAnimationFrame(animId);
    };
    source.start(0);
  }
  isPlaying = true; playBtn.disabled = true;
  statusEl.textContent = 'Lipsyncing...';
  animate();
}
function stopPlay() {
  if (source) { try { source.stop(); } catch(e){} source = null; }
  isPlaying = false;
  playBtn.disabled = (!audioBuffer && !useMediaElement) || isExporting;
  if (!isExporting) {
    statusEl.textContent = (audioBuffer || useMediaElement) ? 'Stopped' : 'Pick eyes & load audio!';
    currentLevel = 0; drawFace(0);
  }
  cancelAnimationFrame(animId);
}
function animate() {
  if ((!isPlaying && !isExporting) || !analyser) return;
  const dataArr = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArr);
  let sum = 0;
  const start = 2, end = Math.min(36, dataArr.length);
  for (let i = start; i < end; i++) sum += dataArr[i];
  let level = Math.min(1, ((sum / (end - start)) / 255) * parseFloat(sensSlider.value));
  const smooth = parseFloat(smoothSlider.value);
  currentLevel = currentLevel * smooth + level * (1 - smooth);
  drawFace(currentLevel);
  if (!isExporting) drawVis(dataArr);
  animId = requestAnimationFrame(animate);
}
function drawVis(dataArr) {
  const dpr = devicePixelRatio || 1;
  visCanvas.width = visCanvas.offsetWidth * dpr;
  visCanvas.height = visCanvas.offsetHeight * dpr;
  const w = visCanvas.width, h = visCanvas.height;
  visCtx.clearRect(0, 0, w, h);
  const bars = 28, step = Math.floor(dataArr.length / bars), barW = w / bars;
  for (let i = 0; i < bars; i++) {
    const v = dataArr[i * step] / 255;
    const bh = v * h * 0.92;
    const g = visCtx.createLinearGradient(0, h, 0, h - bh);
    g.addColorStop(0, '#c084fc'); g.addColorStop(1, '#f0abfc');
    visCtx.fillStyle = g;
    visCtx.fillRect(i * barW + 1, h - bh, barW - 2, bh);
  }
}
exportVidBtn.onclick = async () => {
  if ((!audioBuffer && !useMediaElement) || isExporting) return;
  if (!audioBuffer) {
    statusEl.textContent = 'Export Video needs decoded audio (mp3/wav).';
    return;
  }
  setExportingUI(true);
  statusEl.textContent = 'Recording video...';
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.12;
  source.connect(analyser); analyser.connect(dest); analyser.connect(audioCtx.destination);
  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  recordedChunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
  mediaRecorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 2500000 });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'guest-lol-lipsync.webm'; a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Video downloaded!';
    setExportingUI(false); currentLevel = 0; drawFace(0); isPlaying = false;
  };
  mediaRecorder.start(100);
  isPlaying = true;
  source.onended = () => setTimeout(() => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 150);
  source.start(0); animate();
};
exportGifBtn.onclick = async () => {
  if (!audioBuffer || isExporting) return;
  if (typeof GIF === 'undefined') { statusEl.textContent = 'GIF library needs internet.'; return; }
  const dur = audioBuffer.duration;
  let fps = parseInt(fpsSlider.value, 10) || 12;
  if (dur > 15 && fps > 10) { fps = 10; fpsSlider.value = 10; fpsNum.value = 10; }
  setExportingUI(true);
  statusEl.textContent = 'Analyzing audio...';
  const frameDelay = Math.round(1000 / fps);
  const totalFrames = Math.ceil(dur * fps);
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const levels = new Float32Array(totalFrames);
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / fps));
  let smoothLevel = 0;
  const sens = parseFloat(sensSlider.value) || 1.5;
  const smooth = parseFloat(smoothSlider.value) || 0.2;
  await new Promise((resolve) => {
    let f = 0;
    function analyzeChunk() {
      const end = Math.min(f + 30, totalFrames);
      for (; f < end; f++) {
        const a = f * samplesPerFrame;
        const b = Math.min(a + samplesPerFrame, channelData.length);
        let sum = 0, count = 0;
        const step = (b - a) > 2000 ? 4 : 1;
        for (let i = a; i < b; i += step) { sum += channelData[i] * channelData[i]; count++; }
        let level = count > 0 ? Math.sqrt(sum / count) : 0;
        level = Math.min(1, level * 8 * sens);
        smoothLevel = smoothLevel * smooth + level * (1 - smooth);
        levels[f] = smoothLevel;
      }
      progressFill.style.width = ((f / totalFrames) * 40) + '%';
      if (f < totalFrames) setTimeout(analyzeChunk, 0);
      else resolve();
    }
    analyzeChunk();
  });
  statusEl.textContent = 'Drawing GIF frames...';
  const gif = new GIF({ workers: 2, quality: dur > 12 ? 18 : 12, width: canvas.width, height: canvas.height, workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js' });
  let frameIdx = 0;
  const batchSize = dur > 15 ? 3 : 6;
  function addNextBatch() {
    if (!isExporting) return;
    const end = Math.min(frameIdx + batchSize, totalFrames);
    for (; frameIdx < end; frameIdx++) {
      drawFace(levels[frameIdx]);
      gif.addFrame(canvas, { delay: frameDelay, copy: true });
    }
    progressFill.style.width = (40 + (frameIdx / totalFrames) * 40) + '%';
    if (frameIdx < totalFrames) setTimeout(addNextBatch, 0);
    else {
      statusEl.textContent = 'Encoding GIF...';
      gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'guest-lol-lipsync.gif'; a.click();
        URL.revokeObjectURL(url);
        statusEl.textContent = 'GIF downloaded!';
        setExportingUI(false); currentLevel = 0; drawFace(0);
      });
      gif.on('progress', (p) => { progressFill.style.width = (80 + p * 20) + '%'; });
      try { gif.render(); } catch (err) { statusEl.textContent = 'GIF failed'; setExportingUI(false); }
    }
  }
  addNextBatch();
};
drawFace(0);
