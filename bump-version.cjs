const fs = require('fs');
const path = require('path');

const bump = process.argv[2]; // major | minor | patch
if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error('Usage: node bump-version.cjs <major|minor|patch>');
  process.exit(1);
}

const pkgPath = path.resolve(__dirname, './package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const versionParts = pkg.version.split('.').map(Number);
let [major, minor, patch] = versionParts;

switch (bump) {
  case 'major':
    major += 1;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor += 1;
    patch = 0;
    break;
  case 'patch':
    patch += 1;
    break;
}

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ Updated package.json version to ${newVersion}`);