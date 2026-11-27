import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_ROOT = path.resolve(process.cwd(), "src");

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export default {};",
    };
  }

  if (specifier.startsWith("@/")) {
    const relPath = specifier.slice(2);
    const resolvedUrl = resolveCandidateFile(path.join(SRC_ROOT, relPath));
    if (resolvedUrl) {
      return { shortCircuit: true, url: resolvedUrl };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const resolvedUrl = resolveCandidateFile(path.resolve(parentDir, specifier));
    if (resolvedUrl) {
      return { shortCircuit: true, url: resolvedUrl };
    }
  }

  return nextResolve(specifier, context);
}
