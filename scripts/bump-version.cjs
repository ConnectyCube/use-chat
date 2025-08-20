const fs = require('fs');
const path = require('path');

const arg = process.argv[2]; // major | minor | patch | <version>
if (!arg) {
  console.error('Usage: node bump-version.cjs <major|minor|patch|x.y.z>');
  process.exit(1);
}

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

let newVersion;

if (['major', 'minor', 'patch'].includes(arg)) {
  const versionParts = pkg.version.split('.').map(Number);
  let [major, minor, patch] = versionParts;

  switch (arg) {
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

  newVersion = `${major}.${minor}.${patch}`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  newVersion = arg;
} else {
  console.error('❌ Invalid argument. Use major, minor, patch or x.y.z');
  process.exit(1);
}

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✅ Updated package.json version to ${newVersion}`);
