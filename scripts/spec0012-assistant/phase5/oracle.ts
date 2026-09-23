import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { DICTATION_LIMITS as L, TRANSCRIPTION_MODEL, DictationError, transcriptText, validateWav, wavHeader } from '../../../src/lib/assistant/assistantDictationContract.ts';
import { AssistantTranscriptionService } from '../../../src/lib/assistant/assistantTranscriptionService.ts';
const output = 'output/spec-0012/phase-5/oracle'; mkdirSync(output, { recursive: true });
const assertions: string[] = []; const check = (name: string, run: () => void) => { run(); assertions.push(name); };
const wav = (seconds = 1, rate = 16000) => { const frames = Math.floor(seconds * rate); const b = new Uint8Array(44 + frames * 2); b.set(wavHeader(frames, rate)); b[45] = 100; return b; };
const reject = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof DictationError && e.code === code);
check('exact limits', () => assert.deepEqual(L, { seconds:120, bytes:20971520, timeoutMs:45000, permissionMs:30000, outputChars:6000, outputBytes:12000, responseBytes:64000, active:2, identities:500, usdPerMinute:.0045, maxUsd:.009 }));
check('WAV duration from samples accepts exactly 120 seconds', () => assert.equal(validateWav(wav(120), 'audio/wav').seconds, 120));
check('one sample beyond time rejected', () => reject(() => validateWav(wav(120 + 1/16000), 'audio/wav'), 'limit'));
check('20 MiB exact accepted; one byte beyond rejected', () => { const b = wav((L.bytes-44)/2/96000,96000); assert.equal(b.length,L.bytes); validateWav(b,'audio/wav'); reject(() => validateWav(new Uint8Array(L.bytes+1),'audio/wav'),'limit'); b.fill(0); });
check('WAV header, sample rate, codec, channel, duration, byte mismatches reject', () => { for(const offset of [0,4,8,12,16,20,22,24,28,32,34,36,40]) { const b=wav(); b[offset]^=0x80; reject(()=>validateWav(b,'audio/wav'),'format'); }});
check('unsupported MIME, empty and silence rejected', () => { reject(()=>validateWav(wav(),'audio/webm'),'format'); reject(()=>validateWav(new Uint8Array(44),'audio/wav'),'format'); const b=wav(); b[45]=0; reject(()=>validateWav(b,'audio/wav'),'empty'); reject(()=>validateWav(wav(.1),'audio/wav'),'empty'); });
check('bounded transcript exact chars and bytes; empty and controls rejected', () => { assert.equal(transcriptText('a'.repeat(6000)).length,6000); reject(()=>transcriptText('a'.repeat(6001)),'invalid'); reject(()=>transcriptText('界'.repeat(4001)),'invalid'); reject(()=>transcriptText(' '),'empty'); reject(()=>transcriptText('a\0b'),'invalid'); });
for(const rate of [16000,96000]) {
  let Processor: new () => { process: (input: Float32Array[][]) => boolean; port: { onmessage: (event: {data:string})=>void }; stopped:boolean }; let frames=0, limits=0;
  const context = vm.createContext({ sampleRate:rate, Int16Array, AudioWorkletProcessor: class { port={postMessage:(event:{samples?:Int16Array;limit?:boolean})=>{if(event.samples){frames+=event.samples.length; event.samples.fill(0);} if(event.limit)limits++;},onmessage:()=>{}}; }, registerProcessor: (_: string, value: typeof Processor)=>{Processor=value;} });
  vm.runInContext(readFileSync('public/assistant/dictation-worklet.js','utf8'),context);
  const p=new Processor!(); const input=[[new Float32Array(128).fill(.25)]]; while(p.process(input)){};
  check(`audio-thread exact sample/byte cap at ${rate} Hz`,()=>{assert.equal(frames,Math.min(rate*120,Math.floor((L.bytes-44)/2)));assert.equal(limits,1);});
  const q=new Processor!(); q.process(input); q.port.onmessage({data:'cancel'}); check(`audio-thread Cancel discards pending chunk at ${rate} Hz`,()=>assert.equal(q.process(input),false));
}
const origin='http://127.0.0.1:58070/api/diamond-assistant-transcription';
const request=(bytes=wav(), id=crypto.randomUUID(), headers:Record<string,string>={}, signal?:AbortSignal)=>new Request(origin,{method:'POST',headers:{host:'127.0.0.1:58070','content-type':'audio/wav','x-dictation-id':id,...headers},body:bytes,signal});
let calls=0; const ledger: Record<string,unknown>[]=[];
const transport:typeof fetch=async (url, options)=>{calls++; assert.equal(url,'https://api.openai.com/v1/audio/transcriptions'); assert.equal(options?.method,'POST'); assert.equal(options?.redirect,'error'); const form=options!.body as FormData; assert.deepEqual([...form.keys()].sort(),['file','model','response_format']); assert.equal(form.get('model'),TRANSCRIPTION_MODEL); const file=form.get('file') as File; const bytes=new Uint8Array(await file.arrayBuffer()); const audio=validateWav(bytes,file.type); ledger.push({model:form.get('model'),bytes:bytes.length,seconds:audio.seconds});bytes.fill(0);return Response.json({text:'Where is the drawing tool?'},{headers:{'x-request-id':'fixture-request'}});};
const service=new AssistantTranscriptionService(transport,()=> 'deterministic-nonsecret');
const result=await service.transcribe(request()); const data=await result.json(); check('single isolated payload request, editable text and honest fixed-model receipt',()=>{assert.equal(result.status,200);assert.equal(data.text,'Where is the drawing tool?');assert.equal(data.receipt.transcriptionCalls,1);assert.equal(data.receipt.returnedModel,null);assert.equal(data.receipt.estimatedUsd,.0045/60);assert.equal(calls,1);});
for(const [name,req,status] of [
  ['cross-site',request(wav(),undefined,{'sec-fetch-site':'cross-site'}),403], ['foreign origin',request(wav(),undefined,{origin:'https://evil.example'}),403], ['nonlocal host',request(wav(),undefined,{host:'remote.example'}),403], ['format',request(wav(),undefined,{'content-type':'audio/webm'}),415], ['advertised body overflow',request(wav(),undefined,{'content-length':String(L.bytes+1)}),413], ['invalid identity',request(wav(),'bad'),400], ['actual duration overflow',request(wav(121)),400], ['actual size overflow',request(new Uint8Array(L.bytes+1)),400],
] as const){const before=calls;const res=await service.transcribe(req);check(`${name} rejected before provider`,()=>{assert.equal(res.status,status);assert.equal(calls,before);});}
const duplicate=request();const duplicateId=duplicate.headers.get('x-dictation-id')!;await service.transcribe(duplicate);const count=calls;check('duplicate request ID rejected without retry',()=>{});assert.equal((await service.transcribe(request(wav(),duplicateId))).status,409);assert.equal(calls,count);
const cancelId=crypto.randomUUID();service.cancel(new Request(`${origin}?id=${cancelId}`,{method:'DELETE',headers:{host:'127.0.0.1:58070'}}));check('Cancel before POST installs a no-audio tombstone',()=>{});assert.equal((await service.transcribe(request(wav(),cancelId))).status,409);assert.equal(calls,count);
for(const [name,payload] of [['oversized output',{text:'a'.repeat(6001)}],['wrong model',{text:'hi',model:'wrong'}],['empty output',{text:''}]] as const){const s=new AssistantTranscriptionService(async()=>Response.json(payload),()=> 'fixture');const res=await s.transcribe(request());check(name,()=>assert.notEqual(res.status,200));}
for(const kind of ['timeout','cancel','disconnect','provider-failure','missing-key','response-overflow']){
 let entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r);let aborted=false;
 const s=new AssistantTranscriptionService(async(_,options)=>{entered();if(kind==='provider-failure')return new Response('provider secret', {status:500});if(kind==='response-overflow')return new Response('a'.repeat(64001));return new Promise((_,reject)=>{options!.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('private upstream message'));},{once:true});});},()=>kind==='missing-key'?undefined:'fixture',80);
 const ac=new AbortController();const id=crypto.randomUUID();const pending=s.transcribe(request(wav(),id,{},ac.signal));
 if(['cancel','disconnect'].includes(kind)){await started;if(kind==='disconnect')ac.abort();else s.cancel(new Request(`${origin}?id=${id}`,{method:'DELETE',headers:{host:'127.0.0.1:58070'}}));}
 const res=await pending;const value=await res.json();check(`${kind} bounded terminal without leaking private error`,()=>{assert.notEqual(res.status,200);assert.ok(!JSON.stringify(value).includes('private'));if(['timeout','cancel','disconnect'].includes(kind))assert.equal(aborted,true);});
}
let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);let entered=0;
const bounded=new AssistantTranscriptionService(async()=>{entered++;await gate;return Response.json({text:'hello'});},()=> 'fixture');
const first=bounded.transcribe(request()),second=bounded.transcribe(request());while(entered<2)await new Promise(r=>setTimeout(r,1));check('third concurrent recording rejected',()=>{});assert.equal((await bounded.transcribe(request())).status,429);release();await Promise.all([first,second]);
const tombstones=new AssistantTranscriptionService(transport,()=> 'fixture');for(let i=0;i<500;i++)assert.equal(tombstones.cancel(new Request(`${origin}?id=${crypto.randomUUID()}`,{headers:{host:'127.0.0.1:58070'}})).status,200);check('500 identity memory bound',()=>assert.equal(tombstones.cancel(new Request(`${origin}?id=${crypto.randomUUID()}`,{headers:{host:'127.0.0.1:58070'}})).status,429));
writeFileSync(`${output}/result.json`,JSON.stringify({status:'PASS',assertions,ledger,calls,realProviderCalls:0,paidCalls:0,rawAudioWritten:false},null,2));console.log(JSON.stringify({status:'PASS',assertions:assertions.length}));
