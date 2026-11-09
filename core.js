// Gorilla Tag face assets (PNG paths — works without huge embedded base64)
window.idleData = {
  "Default": "faces/D.png",
  "Smile": "faces/-_-.png",
  "Open": "faces/-o (2).png",
  "Bubbly": "faces/Bubbly Reviewer - Face.png"
};
window.talkingByFace = window.talkingByFace || {};
// Mouth frames: reuse open/closed faces as simple lipsync set until full packs upload
window.talkingByFace["Default"] = [
  "faces/D.png",
  "faces/-_-.png",
  "faces/-o (2).png",
  "faces/-o (2).png"
];
window.talkingByFace["Smile"] = window.talkingByFace["Default"];
window.talkingByFace["Open"] = window.talkingByFace["Default"];
window.talkingByFace["Bubbly"] = window.talkingByFace["Default"];
window.talkingByFace["Bolt / Lightning"] = "BOLT_LAYERED";
window.boltData = window.boltData || { base: "", mouths: [] };
