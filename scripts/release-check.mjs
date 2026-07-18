import { spawn } from 'node:child_process';

function run(command, args, extraEnv = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: 'inherit',
			env: {
				...process.env,
				...extraEnv,
			},
			shell: process.platform === 'win32',
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				process.kill(process.pid, signal);
				return;
			}

			if ((code ?? 1) === 0) {
				resolve();
				return;
			}

			reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

try {
	await run('npm', ['run', 'lint']);
	await run('npm', ['run', 'build']);
	await run('npm', ['pack', '--dry-run'], { RELEASE_MODE: 'true' });
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
