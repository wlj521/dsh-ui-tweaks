import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

// DSH STORE's automatic review blocks any runtime file over 256 KB, and the
// assembled bundle is far over, so the shipped lib/client.js is minified.
// DSH_CLIENT_DEV=1 keeps the readable bundle (and its sectioned source map)
// for local debugging.
const PER_FILE_LIMIT = 262_144
const dev = process.env.DSH_CLIENT_DEV === '1'

// Bundles the tsc-compiled client sources (.client-build/*.js) into the single
// browser bundle the DSH ModuleLoader expects: `window.__ModuleLoader__.load`.
// Host package imports (`@deepseek-ai/*`, `react`, ...) stay on the host's
// `require`; local relative imports route through the private module table.
const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const compiledRoot = join(root, '.client-build')
const outputPath = join(root, 'lib', 'client.js')
const compiledFiles = (await readdir(compiledRoot))
  .filter(path => path.endsWith('.js'))
  .sort((a, b) => a.localeCompare(b))

const lines = []
let outputLine = 0
function push(chunk) {
  if (lines.length > 0) outputLine += 1
  lines.push(chunk)
  outputLine += chunk.split('\n').length - 1
}

push('window.__ModuleLoader__.load({ id: "dsh-ui-tweaks", factory: (require) => {')
push('var __modules = Object.create(null); var __cache = Object.create(null);')
const sections = []
for (const filename of compiledFiles) {
  const moduleId = `./${filename}`
  const compiledPath = join(compiledRoot, filename)
  const source = (await readFile(compiledPath, 'utf8'))
    .replace(/\n?\/\/# sourceMappingURL=.*$/u, '')
    // Keep host package imports on `require`, but route compiler-emitted local
    // CommonJS imports through the private module table. `__load_` has the
    // same width as `require`, so the sectioned source maps remain aligned.
    .replace(/\brequire(?=\(["']\.\.?\/)/gu, '__load_')
  push(`__modules[${JSON.stringify(moduleId)}] = function(module, exports, require, __load_) {`)
  sections.push({
    offset: { line: outputLine + 1, column: 0 },
    map: JSON.parse(await readFile(`${compiledPath}.map`, 'utf8')),
  })
  push(source)
  push('};')
}
for (const line of [
  'function __resolve(from, request) {',
  '  if (!request.startsWith(".")) return request;',
  '  var parts = from.slice(2).split("/"); parts.pop();',
  '  for (var part of request.split("/")) { if (part === "." || part === "") continue; if (part === "..") parts.pop(); else parts.push(part); }',
  '  return "./" + parts.join("/");',
  '}',
  'function __load(id) {',
  '  if (__modules[id] === undefined) return require(id);',
  '  if (__cache[id] !== undefined) return __cache[id].exports;',
  '  var module = __cache[id] = { exports: {} };',
  '  __modules[id](module, module.exports, require, function(request) { var resolved = __resolve(id, request); return __modules[resolved] === undefined ? require(request) : __load(resolved); });',
  '  return module.exports;',
  '}',
  'return __load("./index.js"); } });',
  '//# sourceMappingURL=client.js.map',
  '',
]) push(line)
const wrapped = lines.join('\n')

await mkdir(dirname(outputPath), { recursive: true })
if (dev) {
  await writeFile(outputPath, wrapped)
  for (const section of sections) {
    section.map.file = 'client.js'
  }
  await writeFile(`${outputPath}.map`, `${JSON.stringify({ version: 3, file: 'client.js', sections })}\n`)
} else {
  const result = await transform(wrapped, {
    minify: true,
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    sourcefile: 'client.js',
    sourcemap: 'external',
    sourcesContent: false,
    logLevel: 'warning',
  })
  const code = result.code.replace(/\n?\/\/# sourceMappingURL=.*$/u, '')
  const map = result.map !== undefined && Buffer.byteLength(result.map) <= PER_FILE_LIMIT ? result.map : undefined
  if (map === undefined) {
    await rm(`${outputPath}.map`, { force: true })
    await writeFile(outputPath, `${code}\n`)
  } else {
    await writeFile(`${outputPath}.map`, map)
    await writeFile(outputPath, `${code}\n//# sourceMappingURL=client.js.map\n`)
  }
  console.log(`client bundle: ${Buffer.byteLength(code)} bytes minified (limit ${PER_FILE_LIMIT}), map ${map === undefined ? 'dropped' : `${Buffer.byteLength(map)} bytes`}`)
}
await rm(compiledRoot, { recursive: true, force: true })
