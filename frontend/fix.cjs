const fs = require('fs');
const file = 'd:/AI/pi_git/packwell/frontend/src/pages/MasterData.tsx';
let text = fs.readFileSync(file, 'utf8');

// The replacement logic to fix my mess!
// The exact backslash issue: I wrote \" in python which printed as literal \" in the file.
text = text.replace(/\\"/g, "'");

fs.writeFileSync(file, text);
console.log('Fixed quotes in MasterData.tsx');
