#!/usr/bin/env bun
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type RootPackage = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  repository?: Record<string, unknown>;
  homepage?: string;
  bugs?: Record<string, unknown>;
};

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist-cli");
const distDir = path.join(outputDir, "dist");
const binDir = path.join(outputDir, "bin");

const rootPackage = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8")) as RootPackage;

await rm(outputDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await mkdir(binDir, { recursive: true });

const buildResult = await Bun.build({
  entrypoints: [path.join(rootDir, "src/cli.ts")],
  outdir: distDir,
  target: "bun",
  format: "esm",
  minify: true,
  sourcemap: "none",
});

if (!buildResult.success) {
  throw new Error(`CLI bundle failed with ${buildResult.logs.length} build log(s).`);
}

const wrapper = `#!/usr/bin/env bun\nimport "../dist/cli.js";\n`;

await writeFile(path.join(binDir, "sharemymarkdown"), wrapper, "utf8");
await writeFile(path.join(binDir, "smm"), wrapper, "utf8");
await chmod(path.join(binDir, "sharemymarkdown"), 0o755);
await chmod(path.join(binDir, "smm"), 0o755);

const publishPackage = {
  name: "sharemymarkdown",
  version: rootPackage.version,
  description: rootPackage.description,
  license: rootPackage.license,
  repository: rootPackage.repository,
  homepage: rootPackage.homepage,
  bugs: rootPackage.bugs,
  type: "module",
  publishConfig: {
    access: "public",
  },
  engines: {
    bun: ">=1.3.0",
  },
  bin: {
    sharemymarkdown: "./bin/sharemymarkdown",
    smm: "./bin/smm",
  },
  files: ["bin", "dist", "README.md", "AGENTS.md", "llms.txt"],
};

await writeFile(path.join(outputDir, "package.json"), `${JSON.stringify(publishPackage, null, 2)}\n`, "utf8");
await cp(path.join(rootDir, "README.md"), path.join(outputDir, "README.md"));
await cp(path.join(rootDir, "AGENTS.md"), path.join(outputDir, "AGENTS.md"));
await cp(path.join(rootDir, "llms.txt"), path.join(outputDir, "llms.txt"));

console.log(`CLI package prepared at ${outputDir}`);
