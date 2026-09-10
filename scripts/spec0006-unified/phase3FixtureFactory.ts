import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { UnifiedAnimationDocumentV1, UnifiedAnimationLayerV1, UnifiedAnimationAssetManifestV1, UnifiedDrawingCellPayloadV1 } from "../../src/lib/animation/unifiedAnimationContract.ts";
import type { StickFigureFrameContent } from "../../src/components/workspace/stickfigure/types.ts";
import type { StickSavedProjectRecordV1 } from "../../src/lib/stickProjectStorage.ts";

// No runtime mapper, contract, resolver or renderer is imported by this factory.
export const phase3Cases = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v1/phase3-render-cases.json", "utf8"));
export const fixtureSha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const fixtureCanonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(fixtureCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${fixtureCanonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
const uuid = (n: number) => `63000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const crc = (bytes: Uint8Array) => { let value = 0xffffffff; for (const b of bytes) { value ^= b; for (let bit=0;bit<8;bit++) value=(value>>>1)^((value&1)?0xedb88320:0); } return (value^0xffffffff)>>>0; };
const chunk = (type: string, bytes: Buffer) => { const size=Buffer.alloc(4),sum=Buffer.alloc(4),name=Buffer.from(type);size.writeUInt32BE(bytes.length);sum.writeUInt32BE(crc(Buffer.concat([name,bytes])));return Buffer.concat([size,name,bytes,sum]); };
const makeRaster = (width: number, height: number, variant: number) => {
  const rgba = Buffer.alloc(width*height*4);
  const rect=(x:number,y:number,w:number,h:number,c:number[])=>{for(let row=y;row<Math.min(height,y+h);row++)for(let col=x;col<Math.min(width,x+w);col++){const p=(row*width+col)*4;rgba[p]=c[0];rgba[p+1]=c[1];rgba[p+2]=c[2];rgba[p+3]=c[3]??255;}};
  if(variant<2){
    rect(0,0,width,height,variant===0?[202,227,236]:[242,221,200]);
    rect(0,2350,width,height-2350,[229,225,207]);
    rect(260,1780,1220,570,[130,173,155]);rect(3320,1400,1243,950,[112,157,143]);
    rect(380,290,390,390,[249,204,108]);rect(1130,520,750,90,[255,252,239]);
    rect(2760,360,550,90,[255,252,239]);
  } else { rect(750,792,420,58,[235,180,104]);rect(90,965,1740,8,[47,78,80]); }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const scan=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(scan,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(scan,{level:9})),chunk("IEND",Buffer.alloc(0))]);
  const hash=fixtureSha(png);
  return {manifest:{assetId:`raster-png-${hash}`,kind:"drawing-raster-png" as const,width,height,byteLength:png.length,sha256:hash,rgbaByteLength:rgba.length,rgbaSha256:fixtureSha(rgba)},bytes:png};
};
// Four independent saved owners intentionally contain identical neutral data.
// This fixture proves compositing and ownership, never a Stick motion demo.
export const fixturePose = (): StickFigureFrameContent => {
  const points: Record<string, number[]> = {head:[960,340],neck:[960,430],hip:[960,650],leftElbow:[845,515],leftHand:[820,620],rightElbow:[1075,515],rightHand:[1100,620],leftKnee:[890,775],leftFoot:[855,925],rightKnee:[1030,775],rightFoot:[1065,925],headLeft:[918,340],headRight:[1002,340]};
  const pairs=[["head","neck"],["neck","hip"],["neck","leftElbow"],["leftElbow","leftHand"],["neck","rightElbow"],["rightElbow","rightHand"],["hip","leftKnee"],["leftKnee","leftFoot"],["hip","rightKnee"],["rightKnee","rightFoot"],["headLeft","headRight"]];
  return {figures:[],structureGraph:{joints:Object.entries(points).map(([id,[x,y]])=>({id,x,y})),limbs:pairs.map(([startJointId,endJointId],i)=>({id:`limb-${i}`,startJointId,endJointId})),activeJointId:null}};
};
export function createPhase3Fixture() {
  const [a,b,upper]=[makeRaster(4563,3302,0),makeRaster(4563,3302,1),makeRaster(1920,1080,2)];
  const wav=Buffer.alloc(844);wav.write("RIFF");wav.writeUInt32LE(836,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(800,40);
  const audioHash=fixtureSha(wav),audioId=`audio-${audioHash}`;
  const assets:UnifiedAnimationAssetManifestV1[]=[a.manifest,b.manifest,upper.manifest,{assetId:audioId,kind:"drawing-audio-wav",mimeType:"audio/wav",byteLength:wav.length,sha256:audioHash}];
  const text=(id:string,text:string,x:number,y:number,size:number,width:number,color:string)=>({id,text,x,y,width,flipX:false,flipY:false,rotation:0,fontFamily:"Arial" as const,fontSize:size,color,bold:true,italic:false});
  const payload=(id:string,textObjects:UnifiedDrawingCellPayloadV1["textObjects"]):UnifiedDrawingCellPayloadV1=>({bitmapAssetId:id,tweenEndAssetId:null,motionTween:null,soundAttachment:null,textObjects});
  const base=(order:number,name:string,contentKind:UnifiedAnimationLayerV1["contentKind"]):UnifiedAnimationLayerV1=>({layerId:uuid(order+2),sourceLayerId:`layer-${order}`,sourceOrderIndex:order,name,orderIndex:order,visible:true,locked:false,contentKind,sourceDisplayTransform:contentKind==="drawing/v1"?{sourceWidth:order===0?4563:1920,sourceHeight:order===0?3302:1080,targetWidth:1920,targetHeight:1080,scale:order===0?1080/3302:1,offsetX:order===0?(1920-4563*(1080/3302))/2:0,offsetY:0}:null,cells:[]});
  const background=base(0,"Background","drawing/v1"),stick=base(1,"Stick figure","stick-rig/v1"),foreground=base(2,"Foreground lettering","drawing/v1");
  for(let i=0;i<48;i++){
    const key=i===0||i===12||i===13||i===24,owner=i<12?0:i===12?12:i<24?13:24;
    const p=key?payload(i<24?a.manifest.assetId:b.manifest.assetId,[text("lower-label","BACKGROUND",280,2830,96,1600,"#304e50")]):null;
    if(p&&(i===12||i===13)){p.tweenEndAssetId=b.manifest.assetId;p.motionTween={mode:"position",stageWidth:4563,stageHeight:3302,spriteAssetId:a.manifest.assetId,startOrigin:{x:0,y:0},endOrigin:{x:240,y:0}};}
    if(p&&i===0)p.soundAttachment={id:"wav-1",title:"Silent beat",description:"Deterministic fixture",timingFeel:null,intensityFeel:null,audioAssetId:audioId,contentType:"sfx",speechText:null,sourceTask:"generate-sounds",attachedAt:"2026-09-10T00:00:00.000Z"};
    background.cells.push({cellId:uuid(100+i),sourceCellId:String(i+1),sourceStateId:owner+1,kind:i===13?"tween":key?"keyframe":"frame",cellType:i===13?"tween":key?"keyframe":"hold",ownerCellId:uuid(100+owner),payload:p});
    const poseOwner=Math.floor(i/12)*12;
    stick.cells.push({cellId:uuid(200+i),sourceCellId:String(i+1),sourceStateId:poseOwner+1,kind:i%12===0?"keyframe":"frame",cellType:i%12===0?"keyframe":"hold",ownerCellId:uuid(200+poseOwner),payload:i%12===0?fixturePose():null});
    foreground.cells.push({cellId:uuid(300+i),sourceCellId:String(i+1),sourceStateId:1,kind:i===0?"keyframe":"frame",cellType:i===0?"keyframe":"hold",ownerCellId:uuid(300),payload:i===0?payload(upper.manifest.assetId,[text("title","DRAWING + STICK",90,75,64,1680,"#304e50"),text("subtitle","ONE AUTHORED STAGE",94,164,28,1680,"#304e50"),text("upper-label","FOREGROUND",790,804,28,360,"#304e50")]):null});
  }
  const document:UnifiedAnimationDocumentV1={kind:"diamond-animation-document",schemaVersion:1,projectId:uuid(1),logicalStage:{width:1920,height:1080,origin:"top-left",xAxis:"right",yAxis:"down"},fps:12,layers:[background,stick,foreground],drawingState:{activeTool:"Select",brushSize:4,eraserSize:12,fillColor:"#000000",shapeType:"Square",nextTimelineFrameId:49,nextLayerNumber:4},stickState:{documentRevision:0,nextFrameId:49,nextStateId:49,nextLayerNumber:2},reopenState:{activeLayerId:stick.layerId,activeCellId:stick.cells[0].cellId,currentFrameIndex:0,selectedTimelineIndex:0,onionEnabled:false,activeTool:"Select",activePanel:null,camera:null}};
  const stickProject:StickSavedProjectRecordV1={recordVersion:2,projectId:uuid(1),createdAt:"2026-09-10T00:00:00.000Z",updatedAt:"2026-09-10T00:00:00.000Z",document:{schemaVersion:1,projectType:"stick-figure",projectId:uuid(1),documentRevision:0,title:"MIXED-REALISTIC-01",fps:12,layers:[{id:stick.sourceLayerId,name:stick.name,frames:stick.cells.map((cell,i)=>({id:i+1,kind:cell.kind,cellType:cell.cellType as "keyframe"|"hold",stateId:cell.sourceStateId,isBlank:false,hasTweenEndpoint:false,...(cell.payload?{content:cell.payload as StickFigureFrameContent}:{})}))}],nextFrameId:49,nextStateId:49,nextLayerNumber:2},reopenState:{activeLayerId:stick.sourceLayerId,currentFrameIndex:0,selectedTimelineIndex:0},aiCreationLatch:{latchVersion:1,projectId:uuid(1),status:"consumed"}};
  return {fixtureId:phase3Cases.fixtureId,document,assets,resolvedAssets:[a,b,upper].map(asset=>({assetId:asset.manifest.assetId,base64:asset.bytes.toString("base64")})).concat([{assetId:audioId,base64:wav.toString("base64")}]),stickProject};
}
