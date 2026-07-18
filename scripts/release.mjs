import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const releaseItBin = path.resolve(scriptsDir, '../node_modules/release-it/bin/release-it.js');

const args = [
	releaseItBin,
	'-n',
	'--git.requireBranch',
	'main',
	'--git.requireCleanWorkingDir',
	'--git.requireUpstream',
	'--git.requireCommits',
	'--git.commit',
	'--git.tag',
	'--git.push',
	'--git.changelog=npx auto-changelog --stdout --unreleased --commit-limit false -u --hide-credit',
	'--github.release',
	'--hooks.before:init=npm run lint && npm run build',
	'--hooks.after:bump=npx auto-changelog -p',
];

const child = spawn(process.execPath, args, {
	stdio: 'inherit',
	env: {
		...process.env,
		RELEASE_MODE: 'true',
	},
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});

child.on('error', (error) => {
	console.error(error.message);
	process.exit(1);
});