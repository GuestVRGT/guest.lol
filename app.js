const FACE_SCALE = 1.3;

const canvas = document.getElementById('faceCanvas');
if (canvas.width < 512) { canvas.width = 512; canvas.height = 512; }
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const visCanvas = document.getElementById('visCanvas');
const visCtx = visCanvas.getContext('2d');
const idleGrid = document.getElementById('idleGrid');
const audioInput = document.getElementById('audioInput');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const exportVidBtn = document.getElementById('exportVidBtn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const sensSlider = document.getElementById('sens');
const smoothSlider = document.getElementById('smooth');
const fpsSlider = null;

let selectedFace = 'Default';
let idleImg = new Image();
let talkingImgs = {};
let boltBaseImg = new Image();
let boltMouthImgs = [];
let isPlaying = false;
let isExporting = false;
let audioCtx, analyser, source, audioBuffer;
let currentLevel = 0;
let animId;
let mediaRecorder = null;
let recordedChunks = [];
let useMediaElement = false;
let mediaElement = null;
let mediaObjectUrl = null;

if (!window.talkingByFace) window.talkingByFace = {};
if (!window.idleData) window.idleData = {};
if (!window.boltData) window.boltData = { base: '', mouths: [] };

Object.keys(window.talkingByFace).forEach(name => {
  const set = window.talkingByFace[name];
  if (set === 'BOLT_LAYERED') return;
  if (!Array.isArray(set)) return;
  talkingImgs[name] = set.map(b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    return img;
  });
});
if (window.boltData && window.boltData.base) {
  boltBaseImg.src = 'data:image/png;base64,' + window.boltData.base;
  (window.boltData.mouths || []).forEach(b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    boltMouthImgs.push(img);
  });
}

Object.keys(window.idleData).forEach(name => {
  const img = document.createElement('img');
  img.className = 'face-thumb' + (name === selectedFace ? ' active' : '');
  img.src = 'data:image/png;base64,' + window.idleData[name];
  img.title = name;
  img.onclick = () => {
    if (isExporting) return;
    document.querySelectorAll('.face-thumb').forEach(t => t.classList.remove('active'));
    img.classList.add('active');
    selectedFace = name;
    idleImg.src = 'data:image/png;base64,' + window.idleData[name];
    if (!isPlaying) drawFace(0);
  };
  idleGrid.appendChild(img);
});

if (window.idleData['Default']) {
  idleImg.src = 'data:image/png;base64,' + window.idleData['Default'];
  idleImg.onload = () => drawFace(0);
}

function drawFace(mouthLevel) {
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, size, size);
  const faceSize = Math.floor(size * 0.78 * FACE_SCALE);
  const x = Math.floor((size - faceSize) / 2);
  const y = Math.floor((size - faceSize) / 2);
  ctx.imageSmoothingEnabled = false;

  if (isPlaying || isExporting) {
    if (selectedFace === 'Bolt / Lightning') {
      if (boltBaseImg.complete) ctx.drawImage(boltBaseImg, x, y, faceSize, faceSize);
      const mIdx = Math.max(0, Math.min(9, Math.round(mouthLevel * 9)));
      const mouth = boltMouthImgs[mIdx];
      if (mouth && mouth.complete) ctx.drawImage(mouth, x, y, faceSize, faceSize);
    } else {
      const set = talkingImgs[selectedFace];
      if (set && set.length) {
        const mIdx = Math.max(0, Math.min(set.length - 1, Math.round(mouthLevel * (set.length - 1))));
        const frame = set[mIdx];
        if (frame && frame.complete) ctx.drawImage(frame, x, y, faceSize, faceSize);
      } else if (idleImg.complete) {
        ctx.drawImage(idleImg, x, y, faceSize, faceSize);
      }
    }
  } else if (idleImg.complete && idleImg.naturalWidth) {
    ctx.drawImage(idleImg, x, y, faceSize, faceSize);
  }
}

function setExportingUI(on) {
  isExporting = on;
  const hasMedia = !!(audioBuffer || useMediaElement);
  playBtn.disabled = on || !hasMedia;
  if (exportVidBtn) exportVidBtn.disabled = on || !audioBuffer;
  if (progressBar) progressBar.style.display = on ? 'block' : 'none';
  if (!on && progressFill) progressFill.style.width = '0%';
}

audioInput.onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  statusEl.textContent = 'Loading…';
  playBtn.disabled = true;
  if (exportVidBtn) exportVidBtn.disabled = true;
  try {
    if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = URL.createObjectURL(file);
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const ab = await file.arrayBuffer();
    try { audioBuffer = await audioCtx.decodeAudioData(ab.slice(0)); }
    catch (_) { audioBuffer = null; }
    useMediaElement = /video|mp4|webm|mov/i.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
    if (useMediaElement) {
      mediaElement = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
      mediaElement.src = mediaObjectUrl;
      mediaElement.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { mediaElement.onloadedmetadata = res; mediaElement.onerror = rej; });
      source = audioCtx.createMediaElementSource(mediaElement);
    } else {
      useMediaElement = false;
      mediaElement = null;
    }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = parseFloat(smoothSlider && smoothSlider.value) || 0.4;
    if (source) source.connect(analyser);
    analyser.connect(audioCtx.destination);
    playBtn.disabled = false;
    if (exportVidBtn) exportVidBtn.disabled = !audioBuffer;
    statusEl.textContent = audioBuffer ? 'Ready — Play or Export MP4' : 'Ready to Play';
  } catch (err) {
    statusEl.textContent = 'Load failed: ' + (err.message || err);
  }
};

playBtn.onclick = async () => {
  if (!audioBuffer && !useMediaElement) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  isPlaying = true;
  playBtn.disabled = true;
  if (useMediaElement && mediaElement) {
    mediaElement.currentTime = 0;
    mediaElement.play();
    mediaElement.onended = () => { isPlaying = false; playBtn.disabled = false; drawFace(0); };
  } else if (audioBuffer) {
    if (source) try { source.disconnect(); } catch (_) {}
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = parseFloat(smoothSlider && smoothSlider.value) || 0.4;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start(0);
    source.onended = () => { isPlaying = false; playBtn.disabled = false; drawFace(0); };
  }
  const animate = () => {
    if (!isPlaying || !analyser) return;
    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArr);
    let sum = 0;
    const start = 2, end = Math.min(36, dataArr.length);
    for (let i = start; i < end; i++) sum += dataArr[i];
    let level = Math.min(1, ((sum / (end - start)) / 255) * parseFloat(sensSlider.value));
    const smooth = parseFloat(smoothSlider.value);
    currentLevel = currentLevel * smooth + level * (1 - smooth);
    drawFace(currentLevel);
    if (visCtx) {
      visCtx.fillStyle = '#0a0a0a';
      visCtx.fillRect(0, 0, visCanvas.width, visCanvas.height);
      const barW = visCanvas.width / dataArr.length;
      for (let i = 0; i < dataArr.length; i++) {
        const h = (dataArr[i] / 255) * visCanvas.height;
        visCtx.fillStyle = '#c084fc';
        visCtx.fillRect(i * barW, visCanvas.height - h, barW - 1, h);
      }
    }
    animId = requestAnimationFrame(animate);
  };
  animate();
};

stopBtn.onclick = () => {
  isPlaying = false;
  playBtn.disabled = false;
  if (animId) cancelAnimationFrame(animId);
  if (mediaElement) { mediaElement.pause(); mediaElement.currentTime = 0; }
  if (source && source.stop) try { source.stop(); } catch (_) {}
  if (mediaRecorder && mediaRecorder.state === 'recording') try { mediaRecorder.stop(); } catch (_) {}
  drawFace(0);
  if (progressFill) progressFill.style.width = '0%';
  if (isExporting) setExportingUI(false);
};

if (sensSlider) {
  sensSlider.oninput = () => { const n = document.getElementById('sensNum'); if (n) n.value = sensSlider.value; };
  const sensNum = document.getElementById('sensNum');
  if (sensNum) sensNum.onchange = () => { sensSlider.value = sensNum.value; };
}
if (smoothSlider) {
  smoothSlider.oninput = () => {
    const n = document.getElementById('smoothNum'); if (n) n.value = smoothSlider.value;
    if (analyser) analyser.smoothingTimeConstant = parseFloat(smoothSlider.value) || 0.4;
  };
  const smoothNum = document.getElementById('smoothNum');
  if (smoothNum) smoothNum.onchange = () => { smoothSlider.value = smoothNum.value; };
}

function pickRecorderMime() {
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm'];
  for (const t of types) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch(_){} }
  return '';
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
async function convertWebmToMp4(webmBlob) {
  statusEl.textContent = 'Converting to MP4…';
  if (!window.FFmpegWASM) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
      s.onload = resolve; s.onerror = () => reject(new Error('converter load failed'));
      document.head.appendChild(s);
    });
  }
  if (!window.FFmpegUtil) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/util.js';
      s.onload = resolve; s.onerror = () => reject(new Error('util load failed'));
      document.head.appendChild(s);
    });
  }
  const { FFmpeg } = window.FFmpegWASM;
  const { toBlobURL } = window.FFmpegUtil;
  const ffmpeg = new FFmpeg();
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm')
  });
  await ffmpeg.writeFile('in.webm', new Uint8Array(await webmBlob.arrayBuffer()));
  await ffmpeg.exec(['-i','in.webm','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','out.mp4']);
  const out = await ffmpeg.readFile('out.mp4');
  return new Blob([out.buffer], { type: 'video/mp4' });
}

exportVidBtn.onclick = async () => {
  if (isExporting) return;
  try {
    if (!audioBuffer) { statusEl.textContent = 'Load audio first.'; return; }
    setExportingUI(true);
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    statusEl.textContent = 'Recording…';
    const dest = audioCtx.createMediaStreamDestination();
    if (source) try { source.disconnect(); } catch(_){}
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    analyser.connect(dest);
    const silent = audioCtx.createGain();
    silent.gain.value = 0.0001;
    analyser.connect(silent);
    silent.connect(audioCtx.destination);
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = pickRecorderMime();
    const nativeMp4 = mime.includes('mp4');
    recordedChunks = [];
    try { mediaRecorder = new MediaRecorder(combined, { mimeType: mime || undefined, videoBitsPerSecond: 12000000, audioBitsPerSecond: 192000 }); }
    catch(_) { mediaRecorder = new MediaRecorder(combined); }
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
    const stopped = new Promise((resolve) => { mediaRecorder.onstop = () => resolve(); mediaRecorder.onerror = () => resolve(); });
    mediaRecorder.start(100);
    isPlaying = true;
    const startT = audioCtx.currentTime;
    const dur = audioBuffer.duration;
    const tick = () => {
      if (!isExporting) return;
      if (analyser) {
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        const start = 2, end = Math.min(36, dataArr.length);
        for (let i = start; i < end; i++) sum += dataArr[i];
        let level = Math.min(1, ((sum / (end - start)) / 255) * parseFloat(sensSlider.value));
        const smooth = parseFloat(smoothSlider.value);
        currentLevel = currentLevel * smooth + level * (1 - smooth);
      }
      drawFace(currentLevel);
      if (progressFill) progressFill.style.width = Math.min(100, ((audioCtx.currentTime - startT) / dur) * 100) + '%';
      if (isPlaying) requestAnimationFrame(tick);
    };
    source.onended = () => {
      isPlaying = false;
      setTimeout(() => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 220);
    };
    source.start(0);
    tick();
    await stopped;
    let blob = new Blob(recordedChunks, { type: mime || 'video/webm' });
    let filename = 'guest-lol-gorilla-tag-lipsync.mp4';
    if (!nativeMp4) {
      try { blob = await convertWebmToMp4(blob); }
      catch (err) {
        filename = 'guest-lol-gorilla-tag-lipsync.webm';
        statusEl.textContent = 'MP4 convert failed — saved WebM.';
        downloadBlob(blob, filename);
        setExportingUI(false); currentLevel = 0; drawFace(0); isPlaying = false;
        return;
      }
    }
    downloadBlob(blob, filename);
    statusEl.textContent = 'MP4 downloaded! (' + (blob.size/1024/1024).toFixed(1) + ' MB)';
    setExportingUI(false); currentLevel = 0; drawFace(0); isPlaying = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Export failed: ' + (err.message || err);
    setExportingUI(false); isPlaying = false;
  }
};

drawFace(0);
statusEl.textContent = 'Pick a face & load audio!';
