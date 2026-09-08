import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {
  STICK_JOINT_ROLES, STICK_SEGMENT_ROLE_PAIRS, canonicalJson, cloneCanonical, digestCanonical,
  type StickJointRoleV1, type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";

// Independent analytical oracle, authored before runtime. No runtime safety, motion,
// command executor or pose-generation import is permitted, including type imports.
export type Point = {x: number; y: number};
export type Pose = Record<StickJointRoleV1, Point>;
export const chains = ["leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
export type Chain = typeof chains[number];
export const chainRoles = {
  leftArm: ["neck", "leftElbow", "leftHand"], rightArm: ["neck", "rightElbow", "rightHand"],
  leftLeg: ["hip", "leftKnee", "leftFoot"], rightLeg: ["hip", "rightKnee", "rightFoot"],
} as const;
export const contacts = ["leftFoot", "rightFoot", "leftHand", "rightHand", "hip"] as const;
export type Contact = typeof contacts[number];
export type Limb = {
  movementRole: "active" | "passive_relax" | "passive_balance" | "support" | "recover";
  targetRegion: "none" | {height: "low" | "middle" | "shoulder" | "high"; direction: "forward" | "inward" | "outward" | "center"; reach: "near" | "medium" | "far"};
  limbPlane: "frontal" | "sagittal_near" | "sagittal_far";
  jointGuide: "neutral" | "forward" | "outward" | "toward_hip";
  flexionBand: "extended" | "comfortable" | "folded" | "near_extension_limit" | "near_flexion_limit";
};
export type Context = {
  facing: "front" | "left" | "right";
  supportMode: "grounded" | "airborne";
  supportContacts: Record<Contact, Point | null>;
  limbs: Record<Chain, Limb>;
  posture: "neutral" | "lower" | "compress" | "hinge";
  motionPhase: "rest" | "moving" | "support_transition" | "takeoff" | "landing" | "contact" | "recovery" | "settle" | "step" | "swing";
  rootGoal: "hold" | "shift_left" | "shift_right" | "rise" | "lower" | "travel";
  torsoLine: "upright" | "toward_action" | "away_from_action" | "compress" | "extend" | "hinge";
  headLine: "follow_torso" | "look_toward_action" | "neutral";
  activePartIds: string[]; requiredOutcomes: string[]; forbiddenExtraMovement: string[];
};
export type Landmark = {landmarkId: string; frameIndex: number; kind: "true_key_pose" | "pass_through_guide" | "plane_transition" | "hold" | "contact" | "impact"; context: Context; candidates: Pose[]};
export type Part = {partId: string; semanticKind: "effector_reach" | "effector_oscillation" | "posture_change" | "locomotion" | "airborne_transfer" | "facing_change" | "impact" | "recovery" | "hold"; affectedRoles: Chain[]; requiredOutcomeIds: string[]};
export type Segment = {fromLandmarkId: string; toLandmarkId: string; activePartIds: string[]; facingTransition: "hold" | "turn_left" | "turn_right" | "through_front"; supportTransition: "hold" | "release" | "acquire" | "airborne"; pathIntent: "natural_arc" | "direct_mechanical" | "ballistic"; exitIntent: "continue" | "settle" | "return_to_base" | "continue_cycle"};
export type NaturalRequest = {
  contractVersion: "stick.body-safety-selection/v2";
  binding: {projectId: string; transactionId: string; baseDocumentRevision: number; baseDocumentDigest: string};
  animationRequestDigest: string;
  basePoseBinding: {sourceFrameId: string; sourceFrameDigest: string; context: Context};
  frameCount: number; fps: number; motionStyle: "natural_smooth" | "mechanical_robotic" | "mechanical_stepped";
  requestedParts: Part[]; landmarks: Landmark[]; segments: Segment[];
  completion: {kind: "hold_last" | "return_to_base" | "continue_sequence"; continuingPartIds: string[]; outgoingContext: Context};
};
export type Issue = {reason: string; stage: string};
export type OracleCase = {id: string; operation: string; expect: string; stage?: string; owner?: number};
export const catalog = JSON.parse(readFileSync(resolve("scripts/fixtures/spec0005-stick/v2/body-safety-natural-correction-cases.json"), "utf8")) as {
  frontBase: Pose; seed: number; propertyCount: number; mirrorCount: number; fixedCases: OracleCase[];
  guideThresholdsH: number[]; thresholdExpected: string[]; nearExtensionKneeDegrees: number[];
  bandEdges: {arm: number[][]; leg: number[][]}; transactionMutations: string[];
};
const roles = STICK_JOINT_ROLES;
const pairs = STICK_SEGMENT_ROLE_PAIRS;
const sub = (a: Point, b: Point) => ({x: a.x-b.x, y: a.y-b.y});
const norm = (p: Point) => Math.hypot(p.x,p.y);
const dot = (a: Point,b: Point) => a.x*b.x+a.y*b.y;
const cross = (a: Point,b: Point) => a.x*b.y-a.y*b.x;
export const distance = (a: Point,b: Point) => norm(sub(a,b));
export const roundPose = (p: Pose): Pose => Object.fromEntries(roles.map(r=>[r,{x:Math.round(p[r].x),y:Math.round(p[r].y)}])) as Pose;
const flex = (p: Pose,c: Chain) => {const [a,b,d]=chainRoles[c];return Math.atan2(cross(sub(p[b],p[a]),sub(p[d],p[b])),dot(sub(p[b],p[a]),sub(p[d],p[b])))*180/Math.PI;};
const headAngle = (p: Pose) => Math.atan2(cross(sub(p.neck,p.hip),sub(p.head,p.neck)),dot(sub(p.neck,p.hip),sub(p.head,p.neck)))*180/Math.PI;
const hOf = (p: Pose) => Math.max(p.leftFoot.y,p.rightFoot.y)-p.head.y;
const fail = (reason: string,stage="important_pose"): Issue => ({reason,stage});
const projected = (p: Pose,c: Chain,ctx: Context): {q: number; ambiguous: boolean} => {
  const [root,joint,end] = chainRoles[c];
  const u=sub(p.neck,p.hip), n=norm(u), r={x:-u.y/n,y:u.x/n};
  const limb=ctx.limbs[c]; let g: Point;
  if(c.endsWith("Leg")) {const direction=ctx.facing==="front"?(c==="leftLeg"?1:-1):ctx.facing==="right"?1:-1;g={x:r.x*direction,y:r.y*direction};}
  else if(limb.jointGuide==="toward_hip") g={x:-u.x/n,y:-u.y/n};
  else {const direction=limb.jointGuide==="forward"?(ctx.facing==="right"?1:ctx.facing==="left"?-1:0):(c==="leftArm"?1:-1);g={x:r.x*direction,y:r.y*direction};}
  const chord=sub(p[end],p[root]), size=norm(chord), normal={x:-chord.y/size,y:chord.x/size};
  const component=dot(g,normal);
  return {q:dot(sub(p[joint],p[root]),normal)*Math.sign(component),ambiguous:Math.abs(component)<=1e-9};
};
export function oracleFrame(p: Pose,base: Pose,ctx: Context,stage="important_pose",rest=false): Issue|null {
  const H=hOf(base), e=H*1e-9;
  if(roles.some(r=>!Number.isFinite(p[r].x)||!Number.isFinite(p[r].y))) return fail("non_finite_geometry",stage);
  if(pairs.some(([a,b])=>distance(p[a],p[b])<(stage==="final_frame"?2:1e-9)||Math.abs(distance(p[a],p[b])-distance(base[a],base[b]))>(stage==="final_frame"?2:1e-6)+e))return fail("segment_length",stage);
  if(roles.some(r=>p[r].x<0||p[r].x>1919||p[r].y<0||p[r].y>1079)||p.head.x<40||p.head.x>1879)return fail("stage_bounds",stage);
  for(const c of chains){
    const limb=ctx.limbs[c], [a,b,d]=chainRoles[c], leg=c.endsWith("Leg"), value=Math.abs(flex(p,c));
    if((ctx.facing==="front")!==(limb.limbPlane==="frontal"))return fail("facing_projection",stage);
    const neutral={x:base[b].x+p.hip.x-base.hip.x,y:base[b].y+p.hip.y-base.hip.y};
    const exception=leg&&value<=2+1e-9&&rest&&limb.jointGuide==="neutral"&&["passive_relax","recover"].includes(limb.movementRole)&&ctx.supportContacts[d as Contact]!==null&&distance(p[b],neutral)<=.03*H+e&&["rest","settle"].includes(ctx.motionPhase);
    if(exception)continue;
    if(distance(p[a],p[d])<=e||value<=1e-9)return fail("branch_singularity",stage);
    const guide=projected(p,c,ctx);
    if((leg||limb.movementRole==="active")&&guide.ambiguous)return fail("facing_projection",stage);
    if(value<(leg?6:8)-1e-9||value>(leg?125:150)+1e-9)return fail(leg?"knee_bend":"elbow_bend",stage);
    const bands=leg?catalog.bandEdges.leg:catalog.bandEdges.arm;
    const band=bands[["extended","comfortable","folded","near_extension_limit","near_flexion_limit"].indexOf(limb.flexionBand)];
    if(value<band[0]-1e-9||value>band[1]+1e-9)return fail("flexion_band",stage);
    if(limb.flexionBand.startsWith("near_")&&(ctx.requiredOutcomes.length===0||limb.movementRole!=="active"))return fail("flexion_band",stage);
    if(leg||limb.movementRole==="active"){
      if(limb.jointGuide==="neutral"||(leg&&limb.jointGuide!=="forward"))return fail("limb_plane",stage);
      if(guide.q < -e)return fail("backward_bend",stage);
      if(Math.abs(guide.q)<=e)return fail("branch_singularity",stage);
      if(limb.flexionBand!=="near_extension_limit"&&guide.q<(leg?.015:.01)*H-e)return fail("joint_guide_clearance",stage);
    }
  }
  const lean=Math.atan2(p.neck.x-p.hip.x,p.hip.y-p.neck.y)*180/Math.PI;
  if(p.head.y>=p.neck.y||Math.abs(lean)>(ctx.posture==="hinge"?50:30)+1e-9||Math.abs(headAngle(p))>20+1e-9)return fail("torso_head",stage);
  const segmentDistance=(p:Point,a:Point,b:Point)=>{const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d)));return distance(p,{x:a.x+t*d.x,y:a.y+t*d.y});};
  const touches=(a:Point,b:Point,c:Point,d:Point)=>{
    const ab=sub(b,a),cd=sub(d,c),ac=sub(c,a),den=cross(ab,cd);
    if(Math.abs(den)>e){const t=cross(ac,cd)/den,u=cross(ac,ab)/den;return t>=0&&t<=1&&u>=0&&u<=1;}
    return Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b))<=e;
  };
  for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
    const [a,b]=pairs[i],[c,d]=pairs[j];
    const shared=[a,b].find(r=>r===c||r===d);
    if(shared){const u=sub(p[a===shared?b:a],p[shared]),v=sub(p[c===shared?d:c],p[shared]);if(Math.abs(cross(u,v))<=e&&dot(u,v)>e*e)return fail("body_crossing",stage);}
    else if(touches(p[a],p[b],p[c],p[d]))return fail("body_crossing",stage);
  }
  const headLeft={x:p.head.x-40,y:p.head.y},headRight={x:p.head.x+40,y:p.head.y};
  const headRoles:readonly string[]=["head","neck"];
  for(const [a,b]of pairs)if(!headRoles.includes(a)&&!headRoles.includes(b)&&touches(p[a],p[b],headLeft,headRight))return fail("torso_head",stage);
  for(const hand of ["leftHand","rightHand"]as const)if(segmentDistance(p[hand],p.hip,p.neck)<.03*H-e||segmentDistance(p[hand],headLeft,headRight)<.055*H-e||distance(p[hand],p.head)<.055*H-e)return fail("clearance",stage);
  const planted=contacts.filter(r=>ctx.supportContacts[r]!==null);
  if((ctx.supportMode==="airborne")!==(planted.length===0))return fail("support_contact",stage);
  const ground=Math.max(base.leftFoot.y,base.rightFoot.y);
  if(planted.some(r=>Math.abs(p[r].x-ctx.supportContacts[r]!.x)>2||Math.abs(p[r].y-ctx.supportContacts[r]!.y)>2||Math.abs(p[r].y-ground)>2)||roles.some(r=>p[r].y>ground+2))return fail("support_contact",stage);
  const bx=(2*p.hip.x+p.neck.x+p.head.x)/4;
  if(planted.length){const xs=planted.map(r=>ctx.supportContacts[r]!.x),margin=(planted.length===1?.16:.12)*H;if(bx<Math.min(...xs)-margin-e||bx>Math.max(...xs)+margin+e)return fail("balance",stage);}
  for(const c of chains)if(ctx.limbs[c].movementRole==="passive_relax"){
    const [,joint,end]=chainRoles[c],leg=c.endsWith("Leg");
    for(const [r,limit]of [[joint,leg?.04:.05],[end,leg?.02:.08]]as const){const target={x:base[r].x+p.hip.x-base.hip.x,y:base[r].y+p.hip.y-base.hip.y};if(distance(p[r],target)>limit*H+e)return fail("unrequested_motion",stage);}
  }
  if(!["lower","compress"].includes(ctx.posture)&&p.hip.y-base.hip.y>.05*H+e)return fail("unrequested_motion",stage);
  if(ctx.headLine!=="look_toward_action"&&Math.abs(headAngle(p)-headAngle(base))>8+1e-9)return fail("unrequested_motion",stage);
  return null;
}

export function oracleTransition(a: Landmark,b: Landmark,s: Segment,base: Pose,final=false): Issue|null {
  const H=hOf(base),ctx=b.context,prior=a.context;
  if(s.fromLandmarkId!==a.landmarkId||s.toLandmarkId!==b.landmarkId||b.frameIndex<=a.frameIndex)return fail("context_transition","integration");
  const changed=prior.facing!==ctx.facing;
  if((s.facingTransition==="hold")===changed||(changed&&prior.facing!=="front"&&ctx.facing!=="front"))return fail("context_transition","integration");
  if(s.facingTransition==="turn_left"&&ctx.facing!=="left"||s.facingTransition==="turn_right"&&ctx.facing!=="right"||s.facingTransition==="through_front"&&ctx.facing!=="front")return fail("context_transition","integration");
  const before=contacts.filter(c=>prior.supportContacts[c]),after=contacts.filter(c=>ctx.supportContacts[c]);
  const acquired=after.filter(c=>!before.includes(c)),released=before.filter(c=>!after.includes(c));
  const expected=ctx.supportMode==="airborne"||prior.supportMode==="airborne"?"airborne":released.length?"release":acquired.length?"acquire":"hold";
  if(s.supportTransition!==expected||(acquired.length>0&&released.length>0))return fail("context_transition","integration");
  for(const c of before)if(after.includes(c)&&canonicalJson(prior.supportContacts[c])!==canonicalJson(ctx.supportContacts[c]))return fail("context_transition","integration");
  const p=a.candidates[0],q=b.candidates[0];
  for(const c of chains){
    const f=flex(p,c),g=flex(q,c),[,joint,end]=chainRoles[c];
    if(Math.abs(f)>2&&Math.abs(g)>2&&Math.sign(f)!==Math.sign(g)){
      if(a.kind!=="plane_transition"&&b.kind!=="plane_transition")return fail("branch_flip",final?"final_frame":"important_pose");
      if(ctx.limbs[c].movementRole!=="active"||ctx.supportContacts[end as Contact]||prior.supportContacts[end as Contact]||ctx.limbs[c].limbPlane===prior.limbs[c].limbPlane||Math.abs(f)<12||Math.abs(f)>30||Math.abs(g)<12||Math.abs(g)>30||distance(p[joint],q[joint])>.035*H*(final?1:b.frameIndex-a.frameIndex)||b.frameIndex-a.frameIndex<2&&!final||a.kind==="impact"||b.kind==="impact")return fail("projected_branch_transition",final?"final_frame":"important_pose");
    }
  }
  const rr=chains.filter(c=>ctx.limbs[c].movementRole==="recover").flatMap(c=>chainRoles[c].slice(1));
  if(rr.length){const excursion=(p:Pose,r:StickJointRoleV1)=>distance(p[r],{x:base[r].x+p.hip.x-base.hip.x,y:base[r].y+p.hip.y-base.hip.y});const rms=(p:Pose)=>Math.sqrt(rr.reduce((n,r)=>n+excursion(p,r)**2,0)/rr.length);if(rms(q)>.06*H&&rms(p)-rms(q)<.005*H-1e-9*H||rr.some(r=>!ctx.supportContacts[r as Contact]&&excursion(q,r)-excursion(p,r)>.02*H+1e-9*H))return fail("recovery",final?"final_frame":"important_pose");}
  if(final){const impact=a.kind==="impact"||b.kind==="impact"||a.kind==="contact"||b.kind==="contact";if(roles.some(r=>distance(p[r],q[r])>(r.endsWith("Hand")||r.endsWith("Foot")?(impact?.30:.18):(impact?.20:.12))*H+1e-9*H)||chains.some(c=>Math.abs(flex(q,c)-flex(p,c))>(impact?55:35)+1e-9))return fail("continuity","final_frame");}
  return null;
}
export function oracleRequest(request: NaturalRequest,base: Pose): Issue|null {
  if(canonicalJson(request.basePoseBinding.context)!==canonicalJson(request.landmarks[0].context))return fail("context_transition","integration");
  if(roles.some(r=>distance(base[r],request.landmarks[0].candidates[0][r])>1e-6))return fail("base_pose_mismatch","important_pose");
  for(let i=0;i<request.landmarks.length;i++){
    const l=request.landmarks[i];
    const issue=oracleFrame(l.candidates[0],base,l.context,"important_pose",l.kind==="hold");if(issue)return issue;
    if(i){const transition=oracleTransition(request.landmarks[i-1],l,request.segments[i-1],base);if(transition)return transition;}
  }
  if(request.completion.kind==="return_to_base"&&roles.some(r=>distance(request.landmarks.at(-1)!.candidates[0][r],base[r])>2))return fail("base_pose_mismatch","final_animation");
  return null;
}
export function oracleQualification(request: NaturalRequest,base: Pose): {issue: Issue|null; sets: Pose[][]; edges: number[][][]} {
  if(canonicalJson(request.basePoseBinding.context)!==canonicalJson(request.landmarks[0].context))return {issue:fail("context_transition","integration"),sets:[],edges:[]};
  const sets: Pose[][]=[];const edges:number[][][]=[];
  for(let i=0;i<request.landmarks.length;i++){
    const landmark=request.landmarks[i];let firstIssue:Issue|null=null;const retained:Pose[]=[];
    for(const seed of landmark.candidates){
      // Validate original segment geometry before expanding active IK. In particular a
      // later coincident hip/foot must retain its exact D-0052 cause, not empty-graph text.
      const before=oracleFrame(seed,base,landmark.context,"important_pose",landmark.kind==="hold");
      if(before&&["segment_length","non_finite_geometry","branch_singularity","facing_projection"].includes(before.reason)){firstIssue??=before;continue;}
      let combinations=[cloneCanonical(seed)];
      for(const c of chains.filter(c=>landmark.context.limbs[c].movementRole==="active")){
        combinations=combinations.flatMap(p=>[false,true].map(opposite=>{const q=cloneCanonical(p);solveOracleChain(q,base,c,landmark.context,opposite);return q;}));
      }
      for(const p of combinations){const issue=oracleFrame(p,base,landmark.context,"important_pose",landmark.kind==="hold");if(issue){firstIssue??=issue;continue;}if(i===0&&roles.some(r=>distance(p[r],base[r])>1e-6)){firstIssue??=fail("base_pose_mismatch");continue;}if(!retained.some(q=>canonicalJson(q)===canonicalJson(p)))retained.push(p);}
    }
    if(!retained.length)return {issue:firstIssue??fail("no_safe_sequence"),sets,edges};
    sets.push(retained);
    if(i){const connected:number[][]=[];let firstTransition:Issue|null=null;
      sets[i-1].forEach((a,ai)=>retained.forEach((b,bi)=>{const issue=oracleTransition({...request.landmarks[i-1],candidates:[a]},{...landmark,candidates:[b]},request.segments[i-1],base);if(issue)firstTransition??=issue;else connected.push([ai,bi]);}));
      if(!connected.length)return {issue:firstTransition??fail("no_safe_sequence"),sets,edges};edges.push(connected);
    }
  }
  return {issue:null,sets,edges};
}
export type OracleFinalFrame={frameIndex:number;sourcePoints:Pose;points:Pose;context:Context};
export function oracleFinal(request:NaturalRequest,base:Pose,frames:OracleFinalFrame[]):Issue|null{
  if(frames.length!==request.frameCount)return fail("integration_bypass","integration");
  for(let i=0;i<frames.length;i++){
    const f=frames[i],ctx=oracleContextAt(request,i);
    if(f.frameIndex!==i||canonicalJson(f.context)!==canonicalJson(ctx))return fail("context_transition","final_frame");
    if(canonicalJson(f.points)!==canonicalJson(roundPose(f.sourcePoints)))return fail("integration_bypass","final_frame");
    const issue=oracleFrame(f.sourcePoints,base,ctx,"important_pose",request.landmarks.every(l=>l.kind==="hold"))??oracleFrame(f.points,base,ctx,"final_frame",request.landmarks.every(l=>l.kind==="hold"));if(issue)return {...issue,stage:"final_frame"};
    if(i){const a=request.landmarks.filter(l=>l.frameIndex<=i-1).at(-1)!,b=request.landmarks.filter(l=>l.frameIndex<=i).at(-1)!;
      const transition=oracleTransition({...a,frameIndex:i-1,candidates:[frames[i-1].points]},{...b,frameIndex:i,candidates:[f.points]},
        {fromLandmarkId:a.landmarkId,toLandmarkId:b.landmarkId,activePartIds:ctx.activePartIds,facingTransition:a.context.facing===b.context.facing?"hold":b.context.facing==="front"?"through_front":b.context.facing==="left"?"turn_left":"turn_right",supportTransition:canonicalJson(a.context.supportContacts)===canonicalJson(b.context.supportContacts)?"hold":ctx.supportMode==="airborne"||a.context.supportMode==="airborne"?"airborne":contacts.some(r=>a.context.supportContacts[r]&&!ctx.supportContacts[r])?"release":"acquire",pathIntent:"natural_arc",exitIntent:"continue"},base,true);
      if(transition)return transition;
    }
  }
  if(request.completion.kind==="return_to_base"&&roles.some(r=>distance(frames.at(-1)!.points[r],roundPose(base)[r])>2))return fail("base_pose_mismatch","final_animation");
  if(request.requestedParts.every(p=>p.semanticKind==="hold")&&request.landmarks.every(l=>l.kind==="hold")&&frames.some(f=>canonicalJson(f.points)!==canonicalJson(frames[0].points)))return fail("forbidden_extra_movement","final_animation");
  return null;
}
// Independent context derivation: discrete semantics change at the declared landmark;
// intermediate frames inherit their originating segment, never caller-supplied context.
export function oracleContextAt(request: NaturalRequest,frame: number): Context {
  return cloneCanonical(request.landmarks.filter(l=>l.frameIndex<=frame).at(-1)!.context);
}
export function oracleOwner(request: NaturalRequest): number|null {
  const contexts=request.landmarks.map(l=>l.context);
  if(request.requestedParts.some(p=>p.semanticKind==="effector_oscillation")||contexts.some(c=>c.requiredOutcomes.some(o=>["wave_inward_apex","wave_outward_apex","punch_extension","push_up_bottom"].includes(o))))return 7;
  if(contexts.some(c=>["step","swing"].includes(c.motionPhase)||c.requiredOutcomes.some(o=>["stride_contact","stride_pass","turn_complete"].includes(o)))||request.requestedParts.some(p=>["locomotion","facing_change"].includes(p.semanticKind)))return 6;
  if(request.motionStyle!=="natural_smooth"||request.segments.some(s=>s.pathIntent!=="natural_arc"))return 5;
  if(contexts.some(c=>c.supportMode==="airborne"||c.supportContacts.leftHand||c.supportContacts.rightHand||c.supportContacts.hip)||request.segments.some(s=>s.supportTransition!=="hold")||request.landmarks.some(l=>l.kind==="contact"||l.kind==="impact"))return 4;
  if(request.requestedParts.some(p=>p.semanticKind!=="hold")||request.completion.kind==="continue_sequence"||request.landmarks.some(l=>l.kind!=="hold"||l.context.requiredOutcomes.some(o=>o!=="base_pose_restored")))return 3;
  return null;
}
export function solveOracleChain(p: Pose,base: Pose,c: Chain,ctx: Context,opposite=false): void {
  const [a,b,d]=chainRoles[c],R=p[a],E=p[d],lengthA=distance(base[a],base[b]),lengthB=distance(base[b],base[d]),v=sub(E,R),len=norm(v);
  assert.ok(len>0&&len<=lengthA+lengthB&&len>=Math.abs(lengthA-lengthB),"analytical fixture reach");
  const along=(len*len+lengthA*lengthA-lengthB*lengthB)/(2*len),height=Math.sqrt(Math.max(0,lengthA*lengthA-along*along));
  const options=[-1,1].map(s=>({x:R.x+v.x/len*along-v.y/len*height*s,y:R.y+v.y/len*along+v.x/len*height*s}));
  p[b]=options.find(k=>{p[b]=k;const q=projected(p,c,ctx).q;return opposite?q<0:q>0;})??options[0];
}
export function contextFor(base: Pose): Context {
  return {facing:"front",supportMode:"grounded",supportContacts:{leftFoot:{...base.leftFoot},rightFoot:{...base.rightFoot},leftHand:null,rightHand:null,hip:null},
    limbs:Object.fromEntries(chains.map(c=>[c,{movementRole:c.endsWith("Leg")?"support":"passive_relax",targetRegion:"none",limbPlane:"frontal",jointGuide:c.endsWith("Leg")?"forward":"neutral",flexionBand:c.endsWith("Leg")?"comfortable":"extended"}])) as Record<Chain,Limb>,
    posture:"neutral",motionPhase:"rest",rootGoal:"hold",torsoLine:"upright",headLine:"neutral",activePartIds:["hold"],requiredOutcomes:[],forbiddenExtraMovement:["other_arm_gesture","clap","unrequested_wave","unrequested_hop","unrequested_head_motion","foot_lift","root_travel","extra_peak","pre_action","crab_projection","neutral_reset"]};
}
export function posedProject(base: Pose): StickProjectDocumentV1 {
  const doc=JSON.parse(readFileSync("scripts/fixtures/stick-ai/v1/fresh-stick-project.json","utf8")) as StickProjectDocumentV1;
  const first=doc.layers[0].cells[0];assert.equal(first.cellType,"keyframe");if(first.cellType==="keyframe")first.poses[0].points.forEach((p,i)=>Object.assign(p,base[doc.rigs[0].joints[i].role]));return doc;
}
export async function buildOracleCase(test: OracleCase): Promise<{request: NaturalRequest; base: Pose; starter: StickProjectDocumentV1}> {
  let base=cloneCanonical(catalog.frontBase); const ctx=contextFor(base);
  if(test.operation==="hand-support"){base.leftElbow={x:1210,y:640};base.leftHand={x:1160,y:940};ctx.supportContacts.leftHand={...base.leftHand};ctx.limbs.leftArm.movementRole="support";ctx.limbs.leftArm.flexionBand="comfortable";}
  if(test.operation==="pelvis-support"){
    base={head:{x:880,y:554},neck:{x:900,y:650},hip:{x:960,y:940},leftElbow:{x:1050,y:600},leftHand:{x:1160,y:750},rightElbow:{x:780,y:600},rightHand:{x:700,y:750},leftKnee:{x:1100,y:750},leftFoot:{x:1240,y:940},rightKnee:{x:720,y:730},rightFoot:{x:650,y:850}};
    ctx.facing="right";ctx.supportContacts.hip={...base.hip};for(const c of chains){ctx.limbs[c].limbPlane="sagittal_near";ctx.limbs[c].flexionBand=c.endsWith("Leg")?"folded":"comfortable";}ctx.limbs.rightLeg.movementRole="passive_relax";
  }
  if(test.operation==="translate")for(const r of roles){base[r].x+=130;base[r].y-=30;}
  if(test.operation==="profile-left"||test.operation==="profile-right"){
    ctx.facing=test.operation==="profile-left"?"left":"right";for(const c of chains)ctx.limbs[c].limbPlane="sagittal_near";
    solveOracleChain(base,catalog.frontBase,"leftLeg",ctx);solveOracleChain(base,catalog.frontBase,"rightLeg",ctx);
    base=roundPose(base);
  }
  if(test.operation==="tilt"){
    const theta=.04; for(const r of roles.filter(r=>!r.endsWith("Foot")&&!r.endsWith("Knee"))){const dx=base[r].x-base.hip.x,dy=base[r].y-base.hip.y;base[r]={x:base.hip.x+dx*Math.cos(theta)-dy*Math.sin(theta),y:base.hip.y+dx*Math.sin(theta)+dy*Math.cos(theta)};}base=roundPose(base);
  }
  Object.assign(ctx.supportContacts,{leftFoot:{...base.leftFoot},rightFoot:{...base.rightFoot}});
  if(test.operation==="pelvis-support")ctx.supportContacts.rightFoot=null;
  if(test.operation==="arm-plane"||test.operation==="leg-plane"){
    ctx.facing="right";for(const c of chains)ctx.limbs[c].limbPlane="sagittal_near";
    if(test.operation==="arm-plane"){
      solveOracleChain(base,catalog.frontBase,"leftLeg",ctx);solveOracleChain(base,catalog.frontBase,"rightLeg",ctx);base=roundPose(base);
      base.leftElbow={x:1060,y:330};base.leftHand={x:1160,y:342};ctx.limbs.leftArm={movementRole:"active",targetRegion:{height:"shoulder",direction:"forward",reach:"far"},limbPlane:"sagittal_near",jointGuide:"forward",flexionBand:"near_extension_limit"};
    }else{
      base={head:{x:960,y:240},neck:{x:960,y:520},hip:{x:960,y:740},leftElbow:{x:1100,y:460},leftHand:{x:1160,y:580},rightElbow:{x:820,y:460},rightHand:{x:760,y:580},leftKnee:{x:1060,y:730},leftFoot:{x:1160,y:742},rightKnee:{x:1020,y:840},rightFoot:{x:970,y:940}};
      ctx.supportContacts.leftFoot=null;ctx.supportContacts.rightFoot={...base.rightFoot};ctx.limbs.leftArm.flexionBand="comfortable";ctx.limbs.rightArm.flexionBand="comfortable";ctx.limbs.leftLeg={movementRole:"active",targetRegion:{height:"middle",direction:"forward",reach:"far"},limbPlane:"sagittal_near",jointGuide:"forward",flexionBand:"near_extension_limit"};
    }
    ctx.requiredOutcomes=["reach_apex"];
  }
  const next=cloneCanonical(base),nextCtx=cloneCanonical(ctx); let endKind: Landmark["kind"]="hold";
  const op=test.operation;
  if(op==="arm-plane"||op==="leg-plane"){
    const c=op==="arm-plane"?"leftArm":"leftLeg",[,joint,end]=chainRoles[c];next[joint].y+=20;next[end].y-=4;nextCtx.limbs[c].limbPlane="sagittal_far";endKind="plane_transition";
  }
  if(["compress","shift","return","step","swing","release","forged-release"].includes(op)){
    const dx=["shift","step","swing","release","forged-release"].includes(op)?40:0;
    for(const r of roles.filter(r=>!r.endsWith("Foot")&&!r.endsWith("Knee"))){next[r].x+=dx;next[r].y+=15;}
    nextCtx.posture="compress";nextCtx.rootGoal=dx?"shift_right":"lower";
    solveOracleChain(next,base,"leftLeg",nextCtx);solveOracleChain(next,base,"rightLeg",nextCtx);endKind="true_key_pose";
  }
  if(op==="wrong-knee")solveOracleChain(next,base,"leftLeg",nextCtx,true);
  if(op==="wrong-plane")nextCtx.limbs.leftLeg.limbPlane="sagittal_near";
  if(op==="stretch")next.leftHand.x+=20;
  if(op==="zero-chord"){next.leftFoot={...next.hip};next.leftKnee={x:next.hip.x+distance(base.hip,base.leftKnee),y:next.hip.y};nextCtx.supportContacts.leftFoot=null;nextCtx.limbs.leftLeg.movementRole="active";}
  if(op==="parallel-guide"||op==="tangent"){
    const L=distance(base.hip,base.leftKnee);
    next.leftFoot=op==="parallel-guide"?{x:next.hip.x+L,y:next.hip.y}:{x:next.hip.x,y:next.hip.y+2*L};
    next.leftKnee=op==="parallel-guide"?{x:next.hip.x+L/2,y:next.hip.y+Math.sqrt(3)*L/2}:{x:next.hip.x,y:next.hip.y+L};
    nextCtx.supportContacts.leftFoot=null;nextCtx.limbs.leftLeg.movementRole="active";
  }
  if(["step","swing","release","forged-release"].includes(op)){nextCtx.supportContacts.rightFoot=null;nextCtx.limbs.rightLeg.movementRole="active";nextCtx.motionPhase=op==="swing"?"swing":"step";}
  if(op==="airborne"){nextCtx.supportMode="airborne";nextCtx.supportContacts.leftFoot=null;nextCtx.supportContacts.rightFoot=null;nextCtx.limbs.leftLeg.movementRole="active";nextCtx.limbs.rightLeg.movementRole="active";}
  if(op==="impact"){endKind="impact";nextCtx.motionPhase="contact";}
  if(op==="active-arms")for(const c of ["leftArm","rightArm"]as const){ctx.limbs[c].movementRole="active";ctx.limbs[c].jointGuide="outward";nextCtx.limbs[c]=cloneCanonical(ctx.limbs[c]);}
  if(op==="wave-outcome")nextCtx.requiredOutcomes=["wave_inward_apex"];
  if(op==="gait-outcome")nextCtx.requiredOutcomes=["stride_pass"];
  const starter=posedProject(base),first=starter.layers[0].cells[0];
  const request: NaturalRequest={contractVersion:"stick.body-safety-selection/v2",binding:{projectId:starter.projectId,transactionId:"00000000-0000-4000-8000-000000005005",baseDocumentRevision:starter.documentRevision,baseDocumentDigest:await digestCanonical(starter)},animationRequestDigest:`sha256:${"5".repeat(64)}`,basePoseBinding:{sourceFrameId:first.frameId,sourceFrameDigest:await digestCanonical(first),context:cloneCanonical(ctx)},frameCount:12,fps:12,motionStyle:"natural_smooth",requestedParts:[{partId:"hold",semanticKind:op==="non-hold"?"effector_reach":"hold",affectedRoles:[...chains],requiredOutcomeIds:[]}],landmarks:[{landmarkId:"base",frameIndex:0,kind:"hold",context:ctx,candidates:[base]},{landmarkId:"end",frameIndex:11,kind:endKind,context:nextCtx,candidates:[next]}],segments:[],completion:{kind:"hold_last",continuingPartIds:[],outgoingContext:cloneCanonical(nextCtx)}};
  if(op==="base-context")request.basePoseBinding.context.facing="left";
  if(op==="lost-base"||op==="return")request.completion.kind="return_to_base";
  if(op==="lost-base"){
    for(const r of roles.filter(r=>!r.endsWith("Foot")&&!r.endsWith("Knee")))next[r].y+=10;
    nextCtx.posture="compress";solveOracleChain(next,base,"leftLeg",nextCtx);solveOracleChain(next,base,"rightLeg",nextCtx);
  }
  if(op==="return") { request.landmarks.push({landmarkId:"returned",frameIndex:11,kind:"hold",context:cloneCanonical(ctx),candidates:[cloneCanonical(base)]}); request.landmarks[1].frameIndex=5; }
  if(op==="recovery"||op==="recovery-away"){
    const raised=cloneCanonical(base),v=sub(base.leftElbow,base.neck),w=sub(base.leftHand,base.leftElbow),theta=-.45;
    const rotate=(v:Point)=>({x:v.x*Math.cos(theta)-v.y*Math.sin(theta),y:v.x*Math.sin(theta)+v.y*Math.cos(theta)}),v2=rotate(v),w2=rotate(w);
    raised.leftElbow={x:base.neck.x+v2.x,y:base.neck.y+v2.y};raised.leftHand={x:raised.leftElbow.x+w2.x,y:raised.leftElbow.y+w2.y};
    nextCtx.limbs.leftArm.movementRole="recover";nextCtx.motionPhase="recovery";
    const active=cloneCanonical(ctx);active.limbs.leftArm.movementRole="active";active.limbs.leftArm.jointGuide="outward";
    request.landmarks=[request.landmarks[0],{landmarkId:"raised",frameIndex:4,kind:"true_key_pose",context:active,candidates:[raised]},{landmarkId:"end",frameIndex:11,kind:"true_key_pose",context:nextCtx,candidates:[op==="recovery"?cloneCanonical(base):raised]}];
  }
  for(const l of request.landmarks)for(const c of chains)if(l.context.limbs[c].movementRole==="active")l.context.limbs[c].targetRegion={height:"middle",direction:"outward",reach:"medium"};
  request.basePoseBinding.context=op==="base-context"?request.basePoseBinding.context:cloneCanonical(request.landmarks[0].context);
  request.segments=request.landmarks.slice(1).map((l,i)=>{const prev=request.landmarks[i],released=contacts.some(c=>prev.context.supportContacts[c]&&!l.context.supportContacts[c]);return {fromLandmarkId:prev.landmarkId,toLandmarkId:l.landmarkId,activePartIds:["hold"],facingTransition:"hold",supportTransition:op==="forged-release"?"hold":l.context.supportMode==="airborne"?"airborne":released?"release":"hold",pathIntent:"natural_arc",exitIntent:i===request.landmarks.length-2?(request.completion.kind==="return_to_base"?"return_to_base":"settle"):"continue"};});
  request.completion.outgoingContext=cloneCanonical(request.landmarks.at(-1)!.context);
  return {request,base,starter};
}
export async function propertyProbe(index:number){
  const family=["hold","profile-left","profile-right","airborne","hand-support","pelvis-support","active-arms","step","swing","impact"][Math.floor(index/2)%10];
  const input=await buildOracleCase({id:`property-${index}`,operation:family,expect:"safe"});
  const landmark=input.request.landmarks.at(-1)!;const points=cloneCanonical(landmark.candidates[0]),context=cloneCanonical(landmark.context),base=cloneCanonical(input.base);
  const dx=(Math.imul(index+catalog.seed,1664525)>>>0)%101-50;
  for(const pose of [base,points])for(const r of roles)pose[r].x+=dx;
  for(const c of contacts)if(context.supportContacts[c])context.supportContacts[c]!.x+=dx;
  const bad=index%2===1;if(bad)points.leftHand.x+=23;
  return {family,base,points,context,expected:bad?"segment_length":"safe"};
}
export function mirrorOracle(base:Pose,points:Pose,context:Context){
  const swap=(r:string)=>r.startsWith("left")?r.replace("left","right"):r.startsWith("right")?r.replace("right","left"):r;
  const reflect=(p:Point)=>({x:2*base.hip.x-p.x,y:p.y});
  const mirror=(p:Pose)=>Object.fromEntries(roles.map(r=>[r,reflect(p[swap(r) as StickJointRoleV1])])) as Pose;
  const ctx=cloneCanonical(context);ctx.facing=context.facing==="left"?"right":context.facing==="right"?"left":"front";
  for(const c of chains)ctx.limbs[c]=cloneCanonical(context.limbs[swap(c) as Chain]);
  for(const c of contacts){const point=context.supportContacts[swap(c) as Contact];ctx.supportContacts[c]=point?reflect(point):null;}
  if(ctx.rootGoal==="shift_left")ctx.rootGoal="shift_right";else if(ctx.rootGoal==="shift_right")ctx.rootGoal="shift_left";
  return {base:mirror(base),points:mirror(points),context:ctx};
}
export function kneeGuideProbe(clearanceH:number,nearDegrees:number|null=null){
  const base=cloneCanonical(catalog.frontBase);base.hip={x:960,y:800};base.leftKnee={x:1040,y:860};base.rightKnee={x:880,y:860};
  const H=hOf(base),q=nearDegrees===null?clearanceH*H:100*Math.sin(nearDegrees*Math.PI/360),chord=2*Math.sqrt(10000-q*q),dx=140,dy=Math.sqrt(chord*chord-dx*dx);
  const points=cloneCanonical(base),context=contextFor(base),shift=base.leftFoot.y-dy-base.hip.y;
  for(const r of roles.filter(r=>!r.endsWith("Foot")&&!r.endsWith("Knee")))points[r].y+=shift;
  for(const c of ["leftLeg","rightLeg"]as const){
    const [,joint,end]=chainRoles[c],sgn=c==="leftLeg"?1:-1;
    points[joint]={x:points.hip.x+sgn*(dx/2+dy/chord*q),y:points.hip.y+dy/2-dx/chord*q};
    context.limbs[c].flexionBand=nearDegrees===null?"extended":"near_extension_limit";
    if(nearDegrees!==null){context.limbs[c].movementRole="active";context.limbs[c].targetRegion={height:"low",direction:"outward",reach:"far"};}
    context.supportContacts[end]={...points[end]};
  }
  if(nearDegrees!==null)context.requiredOutcomes=["reach_apex"];
  return {base,points,context};
}
export async function runIndependentOracle() {
  let assertions=0;const results=[];
  for(const test of catalog.fixedCases){const input=await buildOracleCase(test),issue=oracleRequest(input.request,input.base);assert.deepEqual(issue,test.expect==="safe"?null:{reason:test.expect,stage:test.stage},test.id);assertions++;results.push({id:test.id,issue,owner:test.owner??null});
    if(["zero-chord","parallel-guide","tangent"].includes(test.operation)){assert.deepEqual(oracleQualification(input.request,input.base).issue,issue,`${test.id}: graph preserves exact earliest candidate cause`);assertions++;}
  }
  let accepted=0,rejected=0;const families:Record<string,number>={};
  for(let i=0;i<catalog.propertyCount;i++){
    const p=await propertyProbe(i),issue=oracleFrame(p.points,p.base,p.context);assert.equal(issue?.reason??"safe",p.expected,`${p.family} ${i}`);assertions++;if(p.expected==="safe")accepted++;else rejected++;families[p.family]=(families[p.family]??0)+1;
    const m=mirrorOracle(p.base,p.points,p.context);assert.equal(oracleFrame(m.points,m.base,m.context)?.reason??"safe",p.expected,`${p.family} mirror ${i}`);assertions++;
  }
  for(let i=0;i<catalog.guideThresholdsH.length;i++){const p=kneeGuideProbe(catalog.guideThresholdsH[i]);assert.equal(oracleFrame(p.points,p.base,p.context)?.reason??"safe",catalog.thresholdExpected[i],"actual whole-body knee clearance threshold");assertions++;const m=mirrorOracle(p.base,p.points,p.context);assert.equal(oracleFrame(m.points,m.base,m.context)?.reason??"safe",catalog.thresholdExpected[i]);assertions++;}
  for(const degrees of catalog.nearExtensionKneeDegrees){const p=kneeGuideProbe(0,degrees);assert.equal(oracleFrame(p.points,p.base,p.context),null,`near extension ${degrees}`);assertions++;}
  const hold=await buildOracleCase(catalog.fixedCases[0]);
  const frames=Array.from({length:12},(_,frameIndex)=>({frameIndex,sourcePoints:cloneCanonical(hold.base),points:roundPose(hold.base),context:oracleContextAt(hold.request,frameIndex)}));
  assert.equal(oracleFinal(hold.request,hold.base,frames),null);assertions++;
  const wrongContext=cloneCanonical(frames);wrongContext[5].context.facing="left";assert.deepEqual(oracleFinal(hold.request,hold.base,wrongContext),fail("context_transition","final_frame"));assertions++;
  const wrongRound=cloneCanonical(frames);wrongRound[5].points.leftKnee.x++;assert.deepEqual(oracleFinal(hold.request,hold.base,wrongRound),fail("integration_bypass","final_frame"));assertions++;
  return {result:"passed",assertions,fixedCases:results,propertyCandidates:catalog.propertyCount,mirrors:catalog.mirrorCount,seed:catalog.seed,accepted,rejected,families,externalRequests:0,providerRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await runIndependentOracle(),null,2));
