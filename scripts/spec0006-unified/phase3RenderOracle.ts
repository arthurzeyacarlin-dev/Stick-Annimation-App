import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// Independent implementation: no production import, fixture factory, or renderer.
// This module also supplies a browser-serializable reference painter below.
export function oracleHash(value: unknown): string {
  const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize((v as Record<string,unknown>)[k])])):v;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
export function inspectPng(bytes: Uint8Array) {
  const b=Buffer.from(bytes),width=b.readUInt32BE(16),height=b.readUInt32BE(20),chunks:Buffer[]=[];
  for(let p=8;p<b.length;){const n=b.readUInt32BE(p),type=b.toString("ascii",p+4,p+8);if(type==="IDAT")chunks.push(b.subarray(p+8,p+8+n));p+=n+12;}
  const scan=inflateSync(Buffer.concat(chunks)),rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++){assert.equal(scan[y*(width*4+1)],0);scan.copy(rgba,y*width*4,y*(width*4+1)+1,(y+1)*(width*4+1));}
  return {width,height,byteLength:rgba.length,sha256:createHash("sha256").update(rgba).digest("hex")};
}
type Cell={cellId:string;ownerCellId:string|null;cellType:string;payload:unknown};
type Layer={layerId:string;orderIndex:number;visible:boolean;contentKind:string;cells:Cell[]};
export function oracleList(document:{layers:Layer[]},index:number) {
  const result:Array<{layerId:string;kind:string;owner:string;progress:number|null}>=[];
  for(const layer of document.layers.slice().sort((a,b)=>a.orderIndex-b.orderIndex)){
    if(!layer.visible)continue;const c=layer.cells[index];if(!c||c.cellType==="empty")continue;
    const owner=layer.cells.find(o=>o.cellId===c.ownerCellId);assert.ok(owner,"owner exists");
    if(owner.cellType==="blank-keyframe")continue;
    let progress:number|null=null;
    if(owner.cellType==="tween"){
      const span=layer.cells.map((v,i)=>({v,i})).filter(({v})=>v.ownerCellId===owner.cellId);
      progress=(index-span[0].i+1)/(span.at(-1)!.i-span[0].i+2);
    }
    result.push({layerId:layer.layerId,kind:layer.contentKind,owner:owner.cellId,progress});
  }return result;
}
export function assertFrozenFixture(fixture:{document:{layers:Layer[]};assets:Array<{assetId:string;kind:string;sha256:string;rgbaSha256?:string;rgbaByteLength?:number}>;resolvedAssets:Array<{assetId:string;base64:string}>;stickProject:unknown}) {
  const spec=JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v1/phase3-render-cases.json","utf8"));
  const stick=fixture.document.layers.find(l=>l.contentKind==="stick-rig/v1")!;
  const owners=stick.cells.filter(c=>c.payload!==null);
  assert.equal(owners.length,4);assert.equal(new Set(owners.map(c=>c.cellId)).size,4);
  for(const owner of owners)assert.deepEqual(owner.payload,owners[0].payload,"All saved Stick owners must remain the same neutral pose");
  const facts={document:oracleHash({document:fixture.document,assets:fixture.assets.slice().sort((a,b)=>a.assetId.localeCompare(b.assetId))}),source:oracleHash(fixture.stickProject),assets:fixture.assets.map(asset=>{
    const encoded=Buffer.from(fixture.resolvedAssets.find(a=>a.assetId===asset.assetId)!.base64,"base64");assert.equal(createHash("sha256").update(encoded).digest("hex"),asset.sha256);
    if(asset.kind==="drawing-raster-png"){const decoded=inspectPng(encoded);assert.equal(decoded.sha256,asset.rgbaSha256);assert.equal(decoded.byteLength,asset.rgbaByteLength);}
    return {id:asset.assetId,bytes:encoded.length,sha256:asset.sha256,rgba:asset.rgbaSha256??null};
  }),renderLists:oracleHash(Array.from({length:48},(_,i)=>oracleList(fixture.document,i)))};
  if(spec.frozen)assert.deepEqual(facts,spec.frozen);
  return facts;
}

// Executed in Chromium with only the serialized fixture and a Canvas2D context.
// Uses the frozen fixture schedule, not the implementation's owner resolver.
export async function paintReference(canvas:HTMLCanvasElement,fixture:unknown,index:number) {
  type Text={text:string;x:number;y:number;width:number;fontSize:number;fontFamily:string;color:string;bold:boolean;italic:boolean;rotation:number;flipX:boolean;flipY:boolean};
  type Content={bitmapAssetId:string|null;textObjects:Text[];motionTween:null|{spriteAssetId:string;startOrigin:{x:number;y:number};endOrigin:{x:number;y:number}};structureGraph?:{joints:Array<{id:string;x:number;y:number}>;limbs:Array<{startJointId:string;endJointId:string}>}};
  type F={document:{layers:Array<{orderIndex:number;visible:boolean;contentKind:string;sourceDisplayTransform:null|{scale:number;offsetX:number;offsetY:number};cells:Array<{cellType:string;ownerCellId:string;cellId:string;payload:Content}>}>};resolvedAssets:Array<{assetId:string;base64:string}>};
  const f=fixture as F,ctx=canvas.getContext("2d")!;canvas.width=1920;canvas.height=1080;ctx.fillStyle="#f5f5f5";ctx.fillRect(0,0,1920,1080);
  for(const layer of f.document.layers.slice().sort((a,b)=>a.orderIndex-b.orderIndex)){
    if(!layer.visible)continue;const cell=layer.cells[index];if(!cell||cell.cellType==="empty")continue;
    const content=layer.cells.find(c=>c.cellId===cell.ownerCellId)!;if(content.cellType==="blank-keyframe")continue;
    const p=content.payload;ctx.save();
    if(layer.contentKind==="drawing/v1"){
      const t=layer.sourceDisplayTransform;if(t){ctx.translate(t.offsetX,t.offsetY);ctx.scale(t.scale,t.scale);}
      let id=p.bitmapAssetId,x=0,y=0;
      if(content.cellType==="tween"&&p.motionTween){const indices=layer.cells.map((c,i)=>c.ownerCellId===content.cellId?i:-1).filter(i=>i>=0);const u=(index-indices[0]+1)/(indices.length+1);id=p.motionTween.spriteAssetId;x=Math.round(p.motionTween.startOrigin.x+(p.motionTween.endOrigin.x-p.motionTween.startOrigin.x)*u);y=Math.round(p.motionTween.startOrigin.y+(p.motionTween.endOrigin.y-p.motionTween.startOrigin.y)*u);}
      if(id){const a=f.resolvedAssets.find(a=>a.assetId===id)!;const image=new Image();image.src=`data:image/png;base64,${a.base64}`;await image.decode();ctx.imageSmoothingEnabled=false;ctx.drawImage(image,x,y);}
      for(const text of p.textObjects){ctx.font=`${text.italic?"italic ":""}${text.bold?700:400} ${text.fontSize}px "${text.fontFamily}"`;ctx.textBaseline="top";ctx.fillStyle=text.color;ctx.fillText(text.text,text.x,text.y,text.width);}
    } else {
      const graph=p.structureGraph!;ctx.strokeStyle="#10131b";ctx.lineWidth=8;ctx.lineCap="round";
      for(const limb of graph.limbs){const a=graph.joints.find(j=>j.id===limb.startJointId)!,b=graph.joints.find(j=>j.id===limb.endJointId)!;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
      for(const joint of graph.joints){const degree=graph.limbs.filter(l=>l.startJointId===joint.id||l.endJointId===joint.id).length;ctx.fillStyle="#ffffff";ctx.strokeStyle=degree<=1?"#10131b":"rgba(16,19,27,0.76)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(joint.x,joint.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }ctx.restore();
  }
}
