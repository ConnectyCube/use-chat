const { execSync } = require('child_process');

const args = process.argv.slice(2);
let command;

if (args.length === 0) {
  command = `git-chglog --output CHANGELOG.md`;
} else if (args[0] === 'latest') {
  const latestTag = execSync('git describe --tags $(git rev-list --tags --max-count=1)', { shell: '/bin/bash' })
    .toString().trim();
  command = `git-chglog ${latestTag} --output CHANGELOG.md`;
} else if (args[0].includes('-')) {
  const [from, to] = args[0].split('-');
  command = `git-chglog v${from}..v${to} --output CHANGELOG.md`;
} else {
  command = `git-chglog --next-tag v${args[0]} --output CHANGELOG.md`;
}

try {
  console.log(`🚀 Running: ${command}`);
  execSync(command, { stdio: 'inherit' });
  console.log('✅ CHANGELOG.md generated');
} catch (err) {
  console.error('❌ Failed to generate changelog:', err.message);
  process.exit(1);
}