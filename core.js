// Gorilla Tag faces — PNGs under faces/gtag/
window.idleData = {
  "Default": "faces/gtag/idle/Default.png",
  "HQ": "faces/gtag/idle/HQ.png",
  "Emo": "faces/gtag/idle/Emo.png",
  "Cutie": "faces/gtag/idle/Cutie.png",
  "Braces": "faces/gtag/idle/Braces.png",
  "Face Paint": "faces/gtag/idle/FacePaint.png",
  "Sunburnt": "faces/gtag/idle/Sunburnt.png",
  "Sunscreen": "faces/gtag/idle/Sunscreen.png",
  "Shiny": "faces/gtag/idle/Shiny.png",
  "Bolt": "faces/gtag/idle/Bolt.png",
  "Glowy White": "faces/gtag/idle/GlowyWhite.png",
  "Glowy Blue": "faces/gtag/idle/GlowyBlue.png",
  "Glowy Red": "faces/gtag/idle/GlowyRed.png",
  "Glowy Green": "faces/gtag/idle/GlowyGreen.png",
  "Glowy Purple": "faces/gtag/idle/GlowyPurple.png",
  "Glowy Orange": "faces/gtag/idle/GlowyOrange.png",
  "Glowy Yellow": "faces/gtag/idle/GlowyYellow.png",
  "Glowy Teal": "faces/gtag/idle/GlowyTeal.png"
};

window.gtTalkFrames = [];
for (let i = 0; i <= 10; i++) {
  window.gtTalkFrames.push("faces/gtag/talk/" + i + ".png");
}

window.talkingByFace = window.talkingByFace || {};
Object.keys(window.idleData).forEach(name => {
  window.talkingByFace[name] = (name === "Bolt") ? "BOLT_LAYERED" : window.gtTalkFrames;
});

window.boltData = {
  base: "faces/gtag/bolt/face.png",
  mouths: []
};
for (let i = 0; i < 10; i++) {
  window.boltData.mouths.push("faces/gtag/bolt/mouth" + i + ".png");
}
