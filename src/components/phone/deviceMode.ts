// Phone plan (Arthur, Nov 24): ONE app, and the page says which device it is on: <html data-device="computer|tablet|phone"
// data-orient="portrait|landscape">. Every phone/tablet rule starts with html[data-device="phone"] or
// html[data-device="tablet"], so a computer (which always gets "computer") never reads any of them and looks exactly as before.
//
// Rule: a touch screen with no mouse = phone or tablet (a touch laptop with a mouse/trackpad stays a computer).
// Short side of the screen under 600 px = phone (both ways up), otherwise tablet. iPads say they are a Mac, so the touch test
// decides, not the browser name. Test override: add ?device=phone|tablet|computer to any address (remembered in this
// tab only, until the tab closes); ?device=auto goes back to automatic.
// This runs before the page paints (inline in <head>), so the layout never jumps from computer to phone.
export const DEVICE_MODE_SCRIPT = `(function(){try{
var d=document.documentElement;
function forced(){try{var q=new URLSearchParams(location.search).get('device');
if(q==='auto'){sessionStorage.removeItem('diamond.device');}
else if(q==='phone'||q==='tablet'||q==='computer'){sessionStorage.setItem('diamond.device',q);}
var s=sessionStorage.getItem('diamond.device');return s==='phone'||s==='tablet'||s==='computer'?s:null;}catch(e){return null;}}
function pick(){
var dev=forced();
if(!dev){
var touch=window.matchMedia('(pointer: coarse)').matches&&!window.matchMedia('(any-pointer: fine)').matches;
if(touch){var sw=screen.width||0,sh=screen.height||0;var shortSide=Math.min(sw||innerWidth,sh||innerHeight);
dev=shortSide<600?'phone':'tablet';}else{dev='computer';}
}
if(d.getAttribute('data-device')!==dev)d.setAttribute('data-device',dev);
/* Which way up: a real phone or tablet says it itself. The window alone is wrong while typing: the keyboard makes the
   page shorter than it is wide, the whole screen switched to the sideways layout and back (Arthur, Nov 25: typing in the AI
   Animator "breaks the entire UI, the buttons get switched"). A test override (?device=) and old browsers use the window. */
var o=null;
if(!forced()&&dev!=='computer'){try{var so=screen.orientation&&screen.orientation.type;
if(so)o=so.indexOf('landscape')===0?'landscape':'portrait';
else if(typeof window.orientation==='number')o=Math.abs(window.orientation)===90?'landscape':'portrait';}catch(e){}}
if(!o)o=innerWidth>innerHeight?'landscape':'portrait';
if(d.getAttribute('data-orient')!==o)d.setAttribute('data-orient',o);
}
pick();addEventListener('resize',pick);addEventListener('orientationchange',pick);
try{screen.orientation.addEventListener('change',pick);}catch(e){}
try{window.matchMedia('(pointer: coarse)').addEventListener('change',pick);window.matchMedia('(any-pointer: fine)').addEventListener('change',pick);}catch(e){}
/* No hover looks on phones and tablets (Arthur, Nov 24: a finger does not hover, it taps). A phone keeps a hover look
   stuck on a button after a tap, so on a phone or tablet every :hover rule in every style sheet is switched off (it can
   never match). Computers skip this completely. Style sheets that load later (a new page, a pop-up) are handled as they arrive. */
function st(rs){for(var i=0;i<rs.length;i++){var r=rs[i];try{
if(r.selectorText&&r.selectorText.indexOf(':hover')>-1)r.selectorText=r.selectorText.replace(/:hover/g,':not(*)');
if(r.cssRules&&r.cssRules.length)st(r.cssRules);}catch(e){}}}
function nh(){if(d.getAttribute('data-device')==='computer')return;var ss=document.styleSheets;
for(var i=0;i<ss.length;i++){var s=ss[i];try{var rs=s.cssRules;if(s.__nh===rs.length)continue;st(rs);s.__nh=rs.length;}catch(e){}}}
var nt=0;function nq(){if(nt)return;nt=setTimeout(function(){nt=0;nh();},250);}
nq();addEventListener('DOMContentLoaded',nq);addEventListener('load',nq);document.addEventListener('load',nq,true);
try{new MutationObserver(nq).observe(d,{childList:true,subtree:true});}catch(e){}
/* The part of the screen you can really see (Arthur, Nov 24: typing in the AI Animator broke the screen). When the phone's
   keyboard comes up, the page keeps its full height and the phone just slides it; these two numbers say where the visible
   part starts and how tall it is, so the AI screen can sit exactly in it. Phones and tablets only. */
function vv(){if(d.getAttribute('data-device')==='computer')return;var v=window.visualViewport;if(!v)return;
d.style.setProperty('--vv-h',Math.round(v.height)+'px');d.style.setProperty('--vv-top',Math.round(v.offsetTop)+'px');}
vv();try{window.visualViewport.addEventListener('resize',vv);window.visualViewport.addEventListener('scroll',vv);}catch(e){}
addEventListener('resize',vv);addEventListener('orientationchange',vv);
/* After typing in the editor (Arthur, Nov 25: "every time I type, everything breaks, I don't know what I'm clicking").
   Measured on his iPhone: the keyboard slides the page up 349 px to show the typing box, and when the keyboard goes away the
   iPhone leaves the page up there. The top bar is then off the screen, the bottom is empty and every button sits somewhere
   else than it looks. The editor is one fixed screen that never scrolls, so once no typing box is in use it is put back at
   the top. Phones and tablets, editor only; other pages scroll normally. */
function kbField(el){return !!(el&&el.matches&&el.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]),[contenteditable=true]'));}
function unpan(){if(d.getAttribute('data-device')==='computer'||kbField(document.activeElement))return;
var kv=window.visualViewport;if(kbOn&&(!kv||kv.height>=kbFull-80))anchorOff();
if(!document.querySelector('.drawing-right-panel'))return;
var v=window.visualViewport;if(window.scrollY>0||window.scrollX>0||(v&&(v.offsetTop>0||v.pageTop>0))){window.scrollTo(0,0);try{document.scrollingElement.scrollTop=0;document.body.scrollTop=0;}catch(e){}}vv();}
/* ANCHORED WHILE TYPING (Arthur, Nov 25: "I can see behind the AI Animator when I type"). Measured on his iPhone: with the
   keyboard up the page is only 426 px tall and slid up 349 px, so the editor's own box ended 77 px down the screen and cut
   the AI screen off there; under it the empty page showed. While a typing box is in use the editor's box keeps the full
   height it had before the keyboard (set right on the two boxes, so no style rule can miss), and it is given back the
   moment the keyboard is gone. Nothing is moved or restyled: the box just cannot shrink. */
var kbFull=0,kbOn=false;
function kbMeasure(){if(kbOn||kbField(document.activeElement))return;var h=Math.max(innerHeight||0,d.clientHeight||0);if(h>=200)kbFull=h;}
function kbBoxes(){var out=[],tb=document.querySelector('.drawing-topbar'),e=tb&&tb.parentElement;while(e&&e!==document.body&&e!==d){out.push(e);e=e.parentElement;}out.push(document.body);return out;}
function anchorOn(){if(d.getAttribute('data-device')==='computer'||!document.querySelector('.drawing-right-panel'))return;
if(kbFull<200)return;var h=kbFull+'px';kbBoxes().forEach(function(b){b.style.setProperty('height',h,'important');b.style.setProperty('min-height',h,'important');b.style.setProperty('max-height',h,'important');});kbOn=true;d.setAttribute('data-kb','');}
function anchorOff(){if(!kbOn)return;kbOn=false;d.removeAttribute('data-kb');kbBoxes().forEach(function(b){b.style.removeProperty('height');b.style.removeProperty('min-height');b.style.removeProperty('max-height');});}
addEventListener('resize',kbMeasure);addEventListener('load',kbMeasure);addEventListener('pointerdown',kbMeasure,true);addEventListener('touchstart',kbMeasure,{capture:true,passive:true});
document.addEventListener('focusin',function(e){if(kbField(e.target))anchorOn();},true);
/* THE AI SCREEN SHOWS AT ONCE WITH THE KEYBOARD (Arthur, Nov 25: "the AI Animator disappears until I scroll up"). Measured on
   his iPhone: the keyboard slides the page up 349 px, past the end of the page, so the AI screen sat in the empty part until
   he scrolled it back himself. The AI screen already fits itself into the part above the keyboard, so the page has no reason
   to slide: while its message box is in use the page is held at the top (what his own scroll did). Only for typing boxes
   inside the AI screen; every other typing box keeps the phone's own slide so it is never under the keyboard. */
var pinN=0,pinQ=0;
function pinField(){var a=document.activeElement;return kbField(a)&&!!(a.closest&&a.closest('.da-sheet[data-sheet-tab="ai"], .ai-spot'))&&d.getAttribute('data-device')!=='computer'&&!!document.querySelector('.drawing-right-panel');}
function pin(){pinQ=0;if(!pinField())return;var v=window.visualViewport;
if(window.scrollY>0||(v&&(v.offsetTop>0||v.pageTop>0))){if(pinN++<40){window.scrollTo(0,0);try{document.scrollingElement.scrollTop=0;}catch(e){}}}vv();}
function pinSoon(){if(!pinQ)pinQ=setTimeout(pin,16);}
document.addEventListener('focusin',function(e){if(!kbField(e.target))return;pinN=0;[30,120,250,400,600,900,1300,2000].forEach(function(t){setTimeout(pin,t);});},true);
try{window.visualViewport.addEventListener('scroll',pinSoon);window.visualViewport.addEventListener('resize',pinSoon);}catch(e){}
addEventListener('scroll',pinSoon,true);
function unpanSoon(){[60,250,500,900,1500,2500].forEach(function(t){setTimeout(unpan,t);});}
document.addEventListener('focusout',unpanSoon,true);
try{window.visualViewport.addEventListener('resize',function(){setTimeout(unpan,120);});}catch(e){}
window.__diamondDevicePick=pick;
}catch(e){}})();`;

export type DeviceMode = "computer" | "tablet" | "phone";

/** The current device word (read from the page). Safe to call in event handlers; on the server it is "computer". */
export function currentDevice(): DeviceMode {
  if (typeof document === "undefined") return "computer";
  const value = document.documentElement.getAttribute("data-device");
  return value === "phone" || value === "tablet" ? value : "computer";
}

/** Phone or tablet (touch, no mouse). */
export function isTouchDevice(): boolean {
  return currentDevice() !== "computer";
}
