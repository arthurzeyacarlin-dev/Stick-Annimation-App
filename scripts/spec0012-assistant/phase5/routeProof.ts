import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { wavHeader } from '../../../src/lib/assistant/assistantDictationContract.ts';
const root='output/spec-0012/phase-5/route';mkdirSync(root,{recursive:true});const origin='http://127.0.0.1:58070/api/diamond-assistant-transcription';const receipts=[];
const bytes=new Uint8Array(32044);bytes.set(wavHeader(16000,16000));bytes[45]=100;
for(const [name,headers,body,status,code] of [
 ['no-key-safe-route',{'content-type':'audio/wav'},bytes,400,'configuration'],
 ['invalid-format',{'content-type':'audio/webm'},new Uint8Array(0),415,'format'],
 ['cross-site',{'content-type':'audio/wav',origin:'https://other.example'},new Uint8Array(0),403,'invalid'],
] as const){const r=await fetch(origin,{method:'POST',headers:{...headers,'x-dictation-id':crypto.randomUUID()},body});const v=await r.json();assert.equal(r.status,status);assert.equal(v.code,code);receipts.push({name,status,code,providerCalls:v.receipt?.transcriptionCalls??0});}
bytes.fill(0);const id=crypto.randomUUID();const cancel=await fetch(`${origin}?id=${id}`,{method:'DELETE'});assert.equal(cancel.status,200);receipts.push({name:'cancel-tombstone',status:cancel.status,providerCalls:0});writeFileSync(`${root}/result.json`,JSON.stringify({status:'PASS',receipts,realProviderCalls:0,paidCalls:0},null,2));console.log(JSON.stringify({status:'PASS',receipts:receipts.length}));
