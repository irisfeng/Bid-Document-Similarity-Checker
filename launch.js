const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
const child = spawn(electronPath, ['.', ...args], { stdio: 'inherit', windowsHide: false, env });
child.on('close', (code) => process.exit(code || 0));
