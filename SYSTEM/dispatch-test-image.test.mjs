import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchTestImage } from './dispatch-test-image.mjs'
const sha = 'a'.repeat(40), tag = 'v2.0.0-test-rc99'
function fixture(object = {type:'commit', sha}) {
 const calls = []
 const gh = (args, input) => { calls.push({args,input}); return JSON.stringify({object}) }
 return {calls,gh}
}
test('raw SHA and branches are rejected before any GitHub call', () => {
 for(const ref of [sha, 'main', 'release/rc99', 'refs/tags/'+tag, '', 'v2.0.0-test-rc99;echo bad']) {
  const f=fixture(); assert.throws(()=>dispatchTestImage(ref,sha,f.gh)); assert.equal(f.calls.length,0)
 }
})
test('full expected SHA is required',()=>{const f=fixture();assert.throws(()=>dispatchTestImage(tag,'abc1234',f.gh));assert.equal(f.calls.length,0)})
test('mismatched tags cannot dispatch',()=>{const f=fixture({type:'commit',sha:'b'.repeat(40)});assert.throws(()=>dispatchTestImage(tag,sha,f.gh));assert.equal(f.calls.length,1)})
test('missing tag cannot dispatch',()=>{let calls=0;assert.throws(()=>dispatchTestImage(tag,sha,()=>{calls++;throw Error('404')}));assert.equal(calls,1)})
test('dry-run resolves identity without dispatch',()=>{const f=fixture();assert.equal(dispatchTestImage(tag,sha,f.gh,{dryRun:true}).dispatched,false);assert.equal(f.calls.length,1)})
test('dispatch uses full tag refs and normalized image suffix',()=>{const f=fixture();const result=dispatchTestImage(tag,sha,f.gh);assert.equal(f.calls.length,2);assert.deepEqual(JSON.parse(f.calls[1].input),{ref:'refs/tags/'+tag,inputs:{source_ref:'refs/tags/'+tag,test_tag:'rc99'}});assert.equal(result.sourceSha,sha)})
test('annotated tag resolves to verified commit',()=>{let calls=0;const gh=()=>JSON.stringify({object:++calls===1?{type:'tag',sha:'b'.repeat(40)}:{type:'commit',sha}});assert.equal(dispatchTestImage(tag,sha,gh,{dryRun:true}).dispatched,false);assert.equal(calls,2)})
test('tag cycles fail closed',()=>{const f=fixture({type:'tag',sha});assert.throws(()=>dispatchTestImage(tag,sha,f.gh));assert.equal(f.calls.length,6)})
