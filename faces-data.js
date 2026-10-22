// Faces are listed in face_list.js
// For full offline/base64 embed, extract guest-zip-faces-lipsync.zip next to this page
// or use the faces/ folder from that zip.
const FACE_DATA = {};
// FACE_FILES is defined in face_list.js — load that first if needed
if (typeof FACE_FILES === 'undefined') {
  console.warn('Load face_list.js before faces-data.js');
}
