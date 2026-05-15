/**
 * npm 安装时会把 @langchain/core 的传递依赖提升到包根，n8n 加载社区节点时仍按
 * @langchain/core/node_modules/<pkg> 路径做校验，导致 ENOENT。
 * postinstall：对 core 的 dependencies 中每一项，若嵌套目录不存在，则从根 node_modules 解析后 symlink（失败则拷贝）。
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const corePkgPath = path.join(root, "node_modules", "@langchain", "core", "package.json");
const nestedParent = path.join(root, "node_modules", "@langchain", "core", "node_modules");
const rootNodeModules = path.join(root, "node_modules");

function linkPathForPackageName(pkgName) {
	if (pkgName.startsWith("@")) {
		const parts = pkgName.split("/");
		if (parts.length >= 2) {
			return path.join(nestedParent, parts[0], parts[1]);
		}
	}
	return path.join(nestedParent, pkgName);
}

function resolveInstalledDir(pkgName) {
	try {
		return path.dirname(
			require.resolve(`${pkgName}/package.json`, { paths: [rootNodeModules] }),
		);
	} catch {
		const candidate =
			pkgName.startsWith("@") && pkgName.includes("/")
				? path.join(rootNodeModules, ...pkgName.split("/"))
				: path.join(rootNodeModules, pkgName);
		const pkgJson = path.join(candidate, "package.json");
		if (fs.existsSync(pkgJson)) {
			return candidate;
		}
		return null;
	}
}

function ensureNestedForPackage(pkgName) {
	const linkPath = linkPathForPackageName(pkgName);
	try {
		if (fs.existsSync(linkPath)) {
			return;
		}
	} catch {
		return;
	}

	const resolvedDir = resolveInstalledDir(pkgName);
	if (!resolvedDir) {
		return;
	}

	if (path.resolve(resolvedDir) === path.resolve(linkPath)) {
		return;
	}

	try {
		fs.mkdirSync(path.dirname(linkPath), { recursive: true });
		const rel = path.relative(path.dirname(linkPath), resolvedDir);
		fs.symlinkSync(rel, linkPath, "dir");
	} catch {
		try {
			fs.cpSync(resolvedDir, linkPath, { recursive: true });
		} catch {
			// 忽略单包失败，其余依赖仍可能足够加载
		}
	}
}

try {
	if (!fs.existsSync(corePkgPath)) {
		process.exit(0);
	}
	const corePkg = JSON.parse(fs.readFileSync(corePkgPath, "utf8"));
	const deps = corePkg.dependencies;
	if (!deps || typeof deps !== "object") {
		process.exit(0);
	}
	for (const name of Object.keys(deps)) {
		ensureNestedForPackage(name);
	}
} catch {
	process.exitCode = 0;
}
