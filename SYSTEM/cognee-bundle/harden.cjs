// Keep the new offline capture queue disabled until it is bound to destination,
// affected-user consent and immediate revocation (Dashboard #419).
// This only patches our image-owned bundle.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const bundle = path.join(__dirname, 'node_modules/@cognee/cognee-openclaw')
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'))
assert.equal(manifest.version, '2026.10.13', 'Review capture hardening before updating the optional package')
const target = path.join(bundle, 'dist/src/write-buffer.js')
const original = `export function writeBufferFor(path = WRITE_BUFFER_PATH) {
    let buffer = buffers.get(path);
    if (!buffer) {
        buffer = new WriteBuffer(path);
        buffers.set(path, buffer);
    }
    return buffer;
}`
const hardened = `// ClawMax: no offline retention or replay without destination-bound consent.
export function writeBufferFor(_path = WRITE_BUFFER_PATH) {
    return Object.freeze({
        maybeNonEmpty: false,
        async enqueue() {
            throw new Error("Offline capture retention is disabled in ClawMax; retry after the memory service is available.");
        },
        async size() { return 0; },
        async drain() { return 0; },
    });
}`
const source = fs.readFileSync(target, 'utf8')
const consumer = fs.readFileSync(path.join(bundle, 'dist/src/plugin.js'), 'utf8')
assert.equal(consumer.split('const writeBuffer = writeBufferFor();').length, 2, 'Review the capture queue consumer before patching')
assert(!consumer.includes('new WriteBuffer('), 'Direct capture queue use requires review')
if (source.includes(hardened)) {
  assert(!source.includes(original), 'Ambiguous capture hardening state')
} else {
  assert.equal(source.split(original).length, 2, 'Unexpected capture queue implementation; refusing an incomplete patch')
  fs.writeFileSync(target, source.replace(original, hardened))
}
console.log('Optional-memory offline capture retention and replay disabled; live requests unchanged')
