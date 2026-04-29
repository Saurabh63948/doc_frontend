"use client";



import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Share2, Sparkles, Zap, ChevronLeft, MoreHorizontal,
  Monitor, FileText, Layout,
  MousePointer2, Type, Square, Circle, ArrowRight, Pencil, Trash2,
  Bold, Italic, Underline, List, ListOrdered, Minus,
  Save, CheckCircle2, Loader2,
  AlignLeft, AlignCenter, AlignRight,
  Code, Link, Highlighter, ZoomIn, ZoomOut, RotateCcw, Diamond,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// ─── API ──────────────────────────────────────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_API_URL || "https://doc-backend-ouhr.onrender.com";
async function apiFetch(path, token, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Request failed"); }
  return res.json();
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

const PALETTE = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#a855f7","#06b6d4","#ec4899","#f97316","#e0e0e0","#64748b"];

function hexToRgba(hex, a) {
  const n = parseInt((hex||"#3b82f6").replace("#",""), 16) || 0x3b82f6;
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────
function toSX(v, vp) { return v * vp.scale + vp.ox; }
function toSY(v, vp) { return v * vp.scale + vp.oy; }
function toWX(v, vp) { return (v - vp.ox) / vp.scale; }
function toWY(v, vp) { return (v - vp.oy) / vp.scale; }

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawShape(ctx, shape, isSelected, vp) {
  ctx.save();
  const sc = vp.scale;
  const stroke = shape.stroke || "#3b82f6";
  const fill   = shape.fill   || hexToRgba(stroke, 0.07);
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = (isSelected ? 2.5 : 2);
  ctx.fillStyle   = fill;
  if (isSelected) { ctx.shadowColor = stroke; ctx.shadowBlur = 14; }

  switch (shape.type) {
    case "rect": {
      const x = toSX(shape.x, vp), y = toSY(shape.y, vp);
      const w = shape.w * sc, h = shape.h * sc;
      roundRect(ctx, x, y, w, h, 8 * sc);
      ctx.fill(); ctx.stroke();
      if (shape.label) { ctx.fillStyle = "#e0e0e0"; ctx.font = `${13*sc}px Inter,system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowBlur = 0; ctx.fillText(shape.label, x+w/2, y+h/2); ctx.textAlign = "start"; }
      break;
    }
    case "circle": {
      const cx = toSX(shape.x + shape.w/2, vp), cy = toSY(shape.y + shape.h/2, vp);
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(shape.w/2)*sc||1, Math.abs(shape.h/2)*sc||1, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      if (shape.label) { ctx.fillStyle="#e0e0e0"; ctx.font=`${13*sc}px Inter,system-ui`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.shadowBlur=0; ctx.fillText(shape.label,cx,cy); ctx.textAlign="start"; }
      break;
    }
    case "diamond": {
      const x=toSX(shape.x,vp),y=toSY(shape.y,vp),w=shape.w*sc,h=shape.h*sc;
      ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (shape.label) { ctx.fillStyle="#e0e0e0"; ctx.font=`${13*sc}px Inter,system-ui`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.shadowBlur=0; ctx.fillText(shape.label,x+w/2,y+h/2); ctx.textAlign="start"; }
      break;
    }
    case "arrow": {
      const x1=toSX(shape.x,vp),y1=toSY(shape.y,vp),x2=toSX(shape.x2,vp),y2=toSY(shape.y2,vp);
      const ang=Math.atan2(y2-y1,x2-x1), hs=14*sc;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-hs*Math.cos(ang-0.4),y2-hs*Math.sin(ang-0.4)); ctx.lineTo(x2-hs*Math.cos(ang+0.4),y2-hs*Math.sin(ang+0.4)); ctx.closePath(); ctx.fillStyle=stroke; ctx.fill();
      break;
    }
    case "pen": {
      if (!shape.pts||shape.pts.length<2) break;
      ctx.strokeStyle=stroke; ctx.lineWidth=2*sc; ctx.lineJoin="round"; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(toSX(shape.pts[0].x,vp),toSY(shape.pts[0].y,vp));
      for (let i=1;i<shape.pts.length;i++) ctx.lineTo(toSX(shape.pts[i].x,vp),toSY(shape.pts[i].y,vp));
      ctx.stroke(); break;
    }
    case "text": {
      ctx.shadowBlur=0;
      const fs=(shape.fontSize||15)*sc;
      ctx.font=`${fs}px Inter,system-ui`; ctx.fillStyle=shape.stroke||"#e0e0e0"; ctx.textBaseline="top";
      ctx.fillText(shape.text||"",toSX(shape.x,vp),toSY(shape.y,vp));
      if (isSelected) {
        const tw=ctx.measureText(shape.text||"").width;
        ctx.strokeStyle="#60a5fa"; ctx.lineWidth=1; ctx.setLineDash([4,3]);
        ctx.strokeRect(toSX(shape.x,vp)-3,toSY(shape.y,vp)-3,tw+6,fs+8);
        ctx.setLineDash([]);
      }
      break;
    }
  }
  ctx.restore();
}

function getHandlePoints(s) {
  if (!s||s.type==="arrow"||s.type==="pen") return [];
  const { x=0, y=0, w=0, h=0 } = s;
  return [[x,y],[x+w/2,y],[x+w,y],[x,y+h/2],[x+w,y+h/2],[x,y+h],[x+w/2,y+h],[x+w,y+h]];
}

function drawHandles(ctx, shape, vp) {
  getHandlePoints(shape).forEach(([hx,hy]) => {
    ctx.beginPath(); ctx.arc(toSX(hx,vp),toSY(hy,vp),5,0,Math.PI*2);
    ctx.fillStyle="#fff"; ctx.fill(); ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.5; ctx.stroke();
  });
}

function hitTest(shapes, wx, wy) {
  for (let i=shapes.length-1;i>=0;i--) { if(hitsShape(shapes[i],wx,wy)) return i; }
  return null;
}
function hitsShape(s, wx, wy) {
  const pad=6;
  if (s.type==="rect"||s.type==="circle"||s.type==="diamond") {
    return wx>=s.x-pad&&wx<=s.x+s.w+pad&&wy>=s.y-pad&&wy<=s.y+s.h+pad;
  }
  if (s.type==="arrow") {
    const dx=s.x2-s.x,dy=s.y2-s.y,t=Math.max(0,Math.min(1,((wx-s.x)*dx+(wy-s.y)*dy)/((dx*dx+dy*dy)||1)));
    return Math.hypot(wx-(s.x+t*dx),wy-(s.y+t*dy))<12;
  }
  if (s.type==="text") return wx>=s.x-4&&wy>=s.y-4&&wx<=s.x+200&&wy<=s.y+30;
  if (s.type==="pen"&&s.pts) {
    for (let i=0;i<s.pts.length-1;i++) {
      const dx=s.pts[i+1].x-s.pts[i].x,dy=s.pts[i+1].y-s.pts[i].y;
      const t=Math.max(0,Math.min(1,((wx-s.pts[i].x)*dx+(wy-s.pts[i].y)*dy)/((dx*dx+dy*dy)||1)));
      if (Math.hypot(wx-(s.pts[i].x+t*dx),wy-(s.pts[i].y+t*dy))<10) return true;
    }
  }
  return false;
}
function hitHandle(s, wx, wy, scale) {
  const pts=getHandlePoints(s); const r=9/scale;
  for (let i=0;i<pts.length;i++) { if(Math.hypot(wx-pts[i][0],wy-pts[i][1])<r) return i; }
  return null;
}

function buildDraft(tool, sx, sy, ex, ey, shift) {
  let w=ex-sx, h=ey-sy;
  if (shift&&["rect","circle","diamond"].includes(tool)) {
    const s=Math.min(Math.abs(w),Math.abs(h)); w=Math.sign(w)*s; h=Math.sign(h)*s;
  }
  if (tool==="rect")    return {type:"rect",   x:sx+Math.min(0,w),y:sy+Math.min(0,h),w:Math.abs(w),h:Math.abs(h),stroke:"#3b82f6"};
  if (tool==="circle")  return {type:"circle", x:sx+Math.min(0,w),y:sy+Math.min(0,h),w:Math.abs(w),h:Math.abs(h),stroke:"#3b82f6"};
  if (tool==="diamond") return {type:"diamond",x:sx+Math.min(0,w),y:sy+Math.min(0,h),w:Math.abs(w),h:Math.abs(h),stroke:"#3b82f6"};
  if (tool==="arrow")   return {type:"arrow",  x:sx,y:sy,x2:ex,y2:ey,stroke:"#3b82f6"};
  return null;
}

// ─── SaveStatus ────────────────────────────────────────────────────────────────
function SaveStatus({ status }) {
  if (status==="saving")  return <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Loader2 size={12} className="animate-spin"/>Saving…</span>;
  if (status==="saved")   return <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><CheckCircle2 size={12}/>Saved</span>;
  if (status==="unsaved") return <span className="flex items-center gap-1.5 text-[11px] text-amber-400"><Save size={12}/>Unsaved</span>;
  return null;
}

// ─── Rich Toolbar ─────────────────────────────────────────────────────────────
function RichToolbar({ editorRef }) {
  const [fontSize, setFontSize] = useState("3");
  function exec(cmd, val=null) { const el=editorRef?.current; if(!el) return; el.focus(); document.execCommand(cmd,false,val); }
  const groups = [
    [
      {icon:Bold,       label:"Bold",       action:()=>exec("bold")},
      {icon:Italic,     label:"Italic",     action:()=>exec("italic")},
      {icon:Underline,  label:"Underline",  action:()=>exec("underline")},
    ],[
      {label:"H1",action:()=>exec("formatBlock","<h1>")},
      {label:"H2",action:()=>exec("formatBlock","<h2>")},
      {label:"H3",action:()=>exec("formatBlock","<h3>")},
    ],[
      {icon:AlignLeft,   label:"Left",   action:()=>exec("justifyLeft")},
      {icon:AlignCenter, label:"Center", action:()=>exec("justifyCenter")},
      {icon:AlignRight,  label:"Right",  action:()=>exec("justifyRight")},
    ],[
      {icon:List,        label:"Bullet",   action:()=>exec("insertUnorderedList")},
      {icon:ListOrdered, label:"Numbered", action:()=>exec("insertOrderedList")},
      {icon:Minus,       label:"Divider",  action:()=>exec("insertHorizontalRule")},
    ],[
      {icon:Code,        label:"Code",      action:()=>exec("formatBlock","<pre>")},
      {icon:Link,        label:"Link",      action:()=>{ const u=prompt("URL:","https://"); if(u) exec("createLink",u); }},
      {icon:Highlighter, label:"Highlight", action:()=>exec("backColor","none")},
    ],
  ];
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] border-b border-white/5 flex-wrap flex-shrink-0">
      {groups.map((group,gi)=>(
        <React.Fragment key={gi}>
          <div className="flex items-center gap-0.5">
            {group.map((t,i)=>{
              const Icon=t.icon;
              return (
                <button key={i} title={t.label}
                  onMouseDown={e=>{e.preventDefault();t.action();}}
                  className="px-2 py-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-all text-[11px] font-bold">
                  {Icon?<Icon size={14}/>:t.label}
                </button>
              );
            })}
          </div>
          {gi<groups.length-1&&<div className="w-px h-4 bg-white/10"/>}
        </React.Fragment>
      ))}
      <div className="w-px h-4 bg-white/10"/>
      <select value={fontSize} onMouseDown={e=>e.stopPropagation()}
        onChange={e=>{setFontSize(e.target.value);exec("fontSize",e.target.value);}}
        className="bg-[#222] border border-white/10 text-gray-300 text-[11px] rounded px-2 py-1 outline-none">
        {[["1","10px"],["2","12px"],["3","14px"],["4","16px"],["5","18px"],["6","24px"],["7","32px"]].map(([v,l])=>(
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input type="color" defaultValue="#e0e0e0" title="Text color"
        onMouseDown={e=>e.stopPropagation()} onChange={e=>exec("foreColor",e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10 p-0.5"/>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EraserEditor({ file, onBack }) {
  const { token } = useAuth();

  const [activeTab,   setActiveTab]   = useState("both");
  const [activeTool,  setActiveTool]  = useState("select");
  const [shapes,      setShapes]      = useState(()=>{ try{return file?.canvas_data?JSON.parse(file.canvas_data):[];}catch{return[];} });
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [ctxMenu,     setCtxMenu]     = useState(null);
  const [inlineText,  setInlineText]  = useState(null);
  const [saveStatus,  setSaveStatus]  = useState("idle");
  const [vp,          setVp]          = useState({ox:0,oy:0,scale:1});

  const canvasRef      = useRef(null);
  const isDrawing      = useRef(false);
  const startPos       = useRef({x:0,y:0});
  const currentPath    = useRef([]);
  const draftShape     = useRef(null);
  const dragging       = useRef(null);
  const resizing       = useRef(null);
  const panning        = useRef(null);
  const spaceDown      = useRef(false);
  const inlineInputRef = useRef(null);
  const docBodyRef     = useRef(null);
  const docScrollRef   = useRef(null);
  const saveTimer      = useRef(null);
  const shapesRef      = useRef(shapes);
  const vpRef          = useRef(vp);
  const selIdxRef      = useRef(selectedIdx);
  const history        = useRef([JSON.stringify([])]);
  const histIdx        = useRef(0);

  useEffect(()=>{shapesRef.current=shapes;},[shapes]);
  useEffect(()=>{vpRef.current=vp;},[vp]);
  useEffect(()=>{selIdxRef.current=selectedIdx;},[selectedIdx]);
  useEffect(()=>{if(docBodyRef.current&&file?.doc_content)docBodyRef.current.innerHTML=file.doc_content;},[]);// eslint-disable-line

  function preserveScroll(fn) {
    const el = docScrollRef.current;
    const top = el ? el.scrollTop : 0;
    fn();
    requestAnimationFrame(() => { if(el) el.scrollTop = top; });
  }

  const scheduleSave=useCallback(()=>{
    preserveScroll(() => setSaveStatus("unsaved"));
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(saveToServer,2000);
  },[]); // eslint-disable-line

  async function saveToServer() {
    if(!file?.id||!token) return;
    preserveScroll(() => setSaveStatus("saving"));
    try {
      await apiFetch(`/api/files/${file.id}`,token,{method:"PATCH",body:JSON.stringify({doc_content:docBodyRef.current?.innerHTML||"",canvas_data:JSON.stringify(shapesRef.current)})});
      preserveScroll(() => setSaveStatus("saved"));
      setTimeout(() => preserveScroll(() => setSaveStatus("idle")), 3000);
    } catch {
      preserveScroll(() => setSaveStatus("unsaved"));
    }
  }

  function pushHistory(s){ history.current=history.current.slice(0,histIdx.current+1); history.current.push(JSON.stringify(s)); histIdx.current=history.current.length-1; }
  function commitShapes(fn){ setShapes(prev=>{ const n=fn(prev); pushHistory(n); return n; }); scheduleSave(); }

  // Canvas resize
  useEffect(()=>{
    function resize(){ const c=canvasRef.current; if(!c) return; c.width=c.parentElement.offsetWidth; c.height=c.parentElement.offsetHeight; redraw(); }
    resize(); window.addEventListener("resize",resize); return ()=>window.removeEventListener("resize",resize);
  },[]); // eslint-disable-line

  // Redraw on state changes
  useEffect(()=>{ redraw(); });

  function redraw(extra=null) {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); ctx.clearRect(0,0,canvas.width,canvas.height);
    const v=vpRef.current;
    const all=extra?[...shapesRef.current,extra]:shapesRef.current;
    all.forEach((s,i)=>{ drawShape(ctx,s,i===selIdxRef.current,v); if(i===selIdxRef.current) drawHandles(ctx,s,v); });
  }

  function getCanvasPos(e){ const r=canvasRef.current.getBoundingClientRect(); return {x:toWX(e.clientX-r.left,vpRef.current),y:toWY(e.clientY-r.top,vpRef.current)}; }
  function getRawPos(e){ const r=canvasRef.current.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; }

  // Keyboard
  useEffect(()=>{
    const map={v:"select",r:"rect",o:"circle",d:"diamond",a:"arrow",p:"pen",t:"text"};
    function onKey(e){
      const t=document.activeElement; if(t?.tagName==="INPUT"||t?.tagName==="TEXTAREA"||t?.isContentEditable) return;
      const k=e.key.toLowerCase();
      if(map[k]){setActiveTool(map[k]);setSelectedIdx(null);return;}
      if((e.key==="Delete"||e.key==="Backspace")&&selIdxRef.current!==null){commitShapes(p=>p.filter((_,i)=>i!==selIdxRef.current));setSelectedIdx(null);return;}
      if((e.ctrlKey||e.metaKey)&&k==="z"&&!e.shiftKey){if(histIdx.current>0){histIdx.current--;setShapes(JSON.parse(history.current[histIdx.current]));}return;}
      if((e.ctrlKey||e.metaKey)&&(k==="y"||(k==="z"&&e.shiftKey))){if(histIdx.current<history.current.length-1){histIdx.current++;setShapes(JSON.parse(history.current[histIdx.current]));}return;}
      if(e.key===" ")spaceDown.current=true;
    }
    function onKeyUp(e){if(e.key===" ")spaceDown.current=false;}
    window.addEventListener("keydown",onKey); window.addEventListener("keyup",onKeyUp);
    return()=>{window.removeEventListener("keydown",onKey);window.removeEventListener("keyup",onKeyUp);};
  },[selectedIdx]); // eslint-disable-line

  // Scroll zoom
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    function onWheel(e){
      e.preventDefault();
      const raw=getRawPos(e); const delta=e.deltaY<0?1.1:1/1.1;
      setVp(prev=>{ const ns=Math.max(0.15,Math.min(8,prev.scale*delta)); return {ox:raw.x-(raw.x-prev.ox)*(ns/prev.scale),oy:raw.y-(raw.y-prev.oy)*(ns/prev.scale),scale:ns}; });
    }
    canvas.addEventListener("wheel",onWheel,{passive:false}); return()=>canvas.removeEventListener("wheel",onWheel);
  },[]); // eslint-disable-line

  function handleMouseDown(e){
    setCtxMenu(null);
    if(e.button===1||(e.button===0&&spaceDown.current)){
      const raw=getRawPos(e); panning.current={startX:raw.x,startY:raw.y,origOx:vpRef.current.ox,origOy:vpRef.current.oy}; return;
    }
    if(e.button!==0) return;
    const pos=getCanvasPos(e);
    if(activeTool==="select"){
      if(selIdxRef.current!==null){
        const sel=shapesRef.current[selIdxRef.current];
        const hi=sel?hitHandle(sel,pos.x,pos.y,vpRef.current.scale):null;
        if(hi!==null){resizing.current={idx:selIdxRef.current,handle:hi,origShape:{...sel},startWx:pos.x,startWy:pos.y};return;}
      }
      const idx=hitTest(shapesRef.current,pos.x,pos.y);
      if(idx!==null){
        const s=shapesRef.current[idx]; setSelectedIdx(idx);
        dragging.current={idx,startWx:pos.x,startWy:pos.y,origX:s.x,origY:s.y,origX2:s.x2,origY2:s.y2,origPts:s.pts?s.pts.map(p=>({...p})):null};
      } else setSelectedIdx(null);
      return;
    }
    if(activeTool==="text"){e.preventDefault();setInlineText({x:pos.x,y:pos.y,value:""});return;}
    isDrawing.current=true; startPos.current=pos;
    if(activeTool==="pen") currentPath.current=[pos];
  }

  function handleMouseMove(e){
    if(panning.current){
      const raw=getRawPos(e);
      setVp(prev=>({...prev,ox:panning.current.origOx+(raw.x-panning.current.startX),oy:panning.current.origOy+(raw.y-panning.current.startY)})); return;
    }
    if(resizing.current){
      const pos=getCanvasPos(e); const {idx,handle,origShape,startWx,startWy}=resizing.current;
      const dx=pos.x-startWx,dy=pos.y-startWy; let {x,y,w,h}=origShape;
      if(handle===0){x+=dx;y+=dy;w-=dx;h-=dy;}else if(handle===1){y+=dy;h-=dy;}else if(handle===2){y+=dy;w+=dx;h-=dy;}
      else if(handle===3){x+=dx;w-=dx;}else if(handle===4){w+=dx;}else if(handle===5){x+=dx;w-=dx;h+=dy;}
      else if(handle===6){h+=dy;}else if(handle===7){w+=dx;h+=dy;}
      setShapes(prev=>prev.map((s,i)=>i===idx?{...s,x,y,w:Math.max(10,w),h:Math.max(10,h)}:s)); return;
    }
    if(dragging.current){
      const pos=getCanvasPos(e); const {idx,startWx,startWy,origX,origY,origX2,origY2,origPts}=dragging.current;
      const dx=pos.x-startWx,dy=pos.y-startWy;
      setShapes(prev=>prev.map((s,i)=>{
        if(i!==idx) return s;
        if(s.type==="arrow") return {...s,x:origX+dx,y:origY+dy,x2:origX2+dx,y2:origY2+dy};
        if(s.type==="pen"&&origPts) return {...s,pts:origPts.map(p=>({x:p.x+dx,y:p.y+dy}))};
        return {...s,x:origX+dx,y:origY+dy};
      })); return;
    }
    if(!isDrawing.current) return;
    const pos=getCanvasPos(e); const {x:sx,y:sy}=startPos.current;
    if(activeTool==="pen"){
      currentPath.current.push(pos); draftShape.current={type:"pen",pts:[...currentPath.current],stroke:"#e0e0e0"}; redraw(draftShape.current); return;
    }
    const preview=buildDraft(activeTool,sx,sy,pos.x,pos.y,e.shiftKey);
    if(preview){draftShape.current=preview;redraw(preview);}
  }

  function handleMouseUp(){
    panning.current=null;
    if(resizing.current){pushHistory(shapesRef.current);scheduleSave();resizing.current=null;return;}
    if(dragging.current){pushHistory(shapesRef.current);scheduleSave();dragging.current=null;return;}
    if(!isDrawing.current) return;
    isDrawing.current=false;
    const draft=draftShape.current; draftShape.current=null;
    if(!draft) return;
    if(["rect","circle","diamond"].includes(draft.type)&&(Math.abs(draft.w)<8||Math.abs(draft.h)<8)) return;
    commitShapes(prev=>[...prev,{...draft,id:uid()}]);
    if(activeTool!=="pen") setActiveTool("select");
  }

  function handleDoubleClick(e){
    const pos=getCanvasPos(e); const idx=hitTest(shapesRef.current,pos.x,pos.y);
    if(idx===null) return;
    const s=shapesRef.current[idx]; let ix=s.x,iy=s.y;
    if(["rect","circle","diamond"].includes(s.type)){ix=s.x+(s.w||0)/2-65;iy=s.y+(s.h||0)/2-10;}
    setInlineText({x:ix,y:iy,value:s.label||s.text||"",editIdx:idx});
  }

  function handleContextMenu(e){
    e.preventDefault(); const pos=getCanvasPos(e); const idx=hitTest(shapesRef.current,pos.x,pos.y);
    if(idx!==null){setSelectedIdx(idx);const r=canvasRef.current.getBoundingClientRect();setCtxMenu({x:e.clientX-r.left,y:e.clientY-r.top,idx});}
  }

  function commitInlineText(){
    if(!inlineText) return; const val=inlineText.value.trim();
    if(val){
      if(inlineText.editIdx!==undefined) commitShapes(prev=>prev.map((s,i)=>i!==inlineText.editIdx?s:(s.type==="text"?{...s,text:val}:{...s,label:val})));
      else commitShapes(prev=>[...prev,{id:uid(),type:"text",x:inlineText.x,y:inlineText.y,text:val,fontSize:15}]);
    }
    setInlineText(null); if(!inlineText?.editIdx) setActiveTool("select");
  }
  useEffect(()=>{ if(inlineText&&inlineInputRef.current) requestAnimationFrame(()=>inlineInputRef.current?.focus()); },[inlineText]);

  function updateShapeColor(color){ if(selectedIdx===null) return; commitShapes(prev=>prev.map((s,i)=>i===selectedIdx?{...s,stroke:color}:s)); }

  const showDoc    = activeTab==="document"||activeTab==="both";
  const showCanvas = activeTab==="both"  ||activeTab==="both";
  const cursorStyle= panning.current||spaceDown.current?"grab":activeTool==="select"?"default":"crosshair";
  const selShape   = selectedIdx!==null?shapes[selectedIdx]:null;
  // Inline text in screen coords
  const ilx = inlineText ? toSX(inlineText.x,vp) : 0;
  const ily = inlineText ? toSY(inlineText.y,vp) : 0;

  const canvasTools = [
    {id:"select", icon:MousePointer2, label:"Select (V)"},
    {id:"rect",   icon:Square,        label:"Rectangle (R)"},
    {id:"circle", icon:Circle,        label:"Ellipse (O)"},
    {id:"diamond",icon:Diamond,       label:"Diamond (D)"},
    {id:"arrow",  icon:ArrowRight,    label:"Arrow (A)"},
    {id:"pen",    icon:Pencil,        label:"Pen (P)"},
    {id:"text",   icon:Type,          label:"Text (T)"},
  ];

  return (
    <div className="flex flex-col h-screen text-[#e0e0e0] font-sans overflow-hidden" style={{background:"#0f0f0f"}} onClick={()=>setCtxMenu(null)}>

      {/* NAV */}
      <nav className="h-12 border-b border-white/[0.06] flex items-center justify-between px-4 bg-[#141414] z-50 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="hover:bg-white/8 p-1.5 rounded-lg transition-colors text-gray-400 hover:text-white"><ChevronLeft size={18}/></button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center shadow-lg shadow-blue-900/40"><Zap size={13} className="text-white fill-current"/></div>
            <span className="text-sm font-semibold text-gray-100 truncate max-w-[200px]">{file?.name||"Untitled"}</span>
            <MoreHorizontal size={14} className="text-gray-600 cursor-pointer hover:text-gray-400"/>
          </div>
          <div className="ml-2"><SaveStatus status={saveStatus}/></div>
        </div>
        <div className="flex bg-[#0f0f0f] border border-white/[0.08] rounded-lg p-1 gap-0.5">
          {[{id:"document",label:"Document",icon:FileText},{id:"both",label:"Both",icon:Layout},{id:"canvas",label:"Canvas",icon:Monitor}].map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-all ${activeTab===tab.id?"bg-[#252525] text-white shadow":"text-gray-500 hover:text-gray-300"}`}>
              <tab.icon size={12}/> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveToServer} className="text-[11px] font-semibold border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2 transition-colors text-gray-400 hover:text-white"><Save size={13}/> Save</button>
          <button className="text-[11px] font-semibold border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2 transition-colors text-gray-400 hover:text-white"><Share2 size={13}/> Share</button>
          <button className="text-[11px] font-semibold bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-500 flex items-center gap-2 text-white transition-colors shadow-lg shadow-blue-900/30"><Sparkles size={13}/> AI Chat</button>
        </div>
      </nav>

      {/* CONTENT */}
      <div className="flex flex-1 overflow-hidden">

        {/* DOC */}
        {showDoc && (
          <section className={`flex flex-col h-full ${activeTab==="both"?"w-1/2 border-r border-white/[0.05]":"w-full"}`} style={{background:"#111"}}>
            <RichToolbar editorRef={docBodyRef}/>
            <div ref={docScrollRef} className="flex-1 overflow-y-auto" style={{scrollbarWidth:"thin",scrollbarColor:"rgba(255,255,255,0.08) transparent"}}>
              <div className="max-w-2xl mx-auto px-10 py-10">
                <div contentEditable suppressContentEditableWarning data-placeholder="Untitled" spellCheck={false} onInput={scheduleSave}
                  className="text-[2.2rem] font-black text-white mb-2 outline-none leading-tight empty:before:content-[attr(data-placeholder)] empty:before:text-white/15"
                  ref={el=>{if(el&&!el.dataset.initialized){el.dataset.initialized="1";el.textContent=file?.name||"";}}}/>
                <div className="text-xs text-white/20 mb-8 pb-6 border-b border-white/5">Last edited just now</div>
                <div ref={docBodyRef} contentEditable suppressContentEditableWarning className="outline-none min-h-[60vh] doc-body" spellCheck={false} onInput={scheduleSave}/>
              </div>
            </div>
          </section>
        )}

        {/* CANVAS */}
        {showCanvas && (
          <section className={`h-full relative overflow-hidden ${activeTab==="both"?"flex-1":"w-full"}`}
            style={{background:"#0b0b0b",backgroundImage:"radial-gradient(circle,#1d1d1d 1px,transparent 1px)",backgroundSize:"28px 28px"}}>

            {/* Tool sidebar */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-2 rounded-2xl shadow-2xl z-20 border border-white/[0.06]" style={{background:"#161616"}}>
              {canvasTools.map(tool=>(
                <button key={tool.id} onClick={()=>{setActiveTool(tool.id);setSelectedIdx(null);}} title={tool.label}
                  className={`p-2 rounded-xl transition-all ${activeTool===tool.id?"bg-blue-600 text-white shadow-lg shadow-blue-900/50":"hover:bg-white/8 text-gray-500 hover:text-gray-200"}`}>
                  <tool.icon size={17}/>
                </button>
              ))}
              <div className="w-full h-px bg-white/5 my-1"/>
              <button onClick={()=>{commitShapes(()=>[]);setSelectedIdx(null);}} title="Clear all"
                className="p-2 rounded-xl hover:bg-red-900/30 text-gray-600 hover:text-red-400 transition-all"><Trash2 size={17}/></button>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-6 right-6 flex items-center gap-1 p-1.5 rounded-xl border border-white/[0.06] shadow-xl z-20" style={{background:"#161616"}}>
              <button onClick={()=>setVp(v=>({...v,scale:Math.min(v.scale*1.2,8)}))} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all"><ZoomIn size={15}/></button>
              <span className="text-[11px] text-gray-500 w-11 text-center font-mono">{Math.round(vp.scale*100)}%</span>
              <button onClick={()=>setVp(v=>({...v,scale:Math.max(v.scale/1.2,0.15)}))} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all"><ZoomOut size={15}/></button>
              <div className="w-px h-4 bg-white/10 mx-1"/>
              <button onClick={()=>setVp({ox:0,oy:0,scale:1})} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all"><RotateCcw size={14}/></button>
            </div>

            {/* AI button */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <button className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 rounded-2xl text-sm font-semibold hover:border-blue-500 transition-all shadow-2xl border" style={{background:"#161616",borderColor:"#2a2a2a"}}>
                <Sparkles size={15} className="text-blue-400"/>
                <span className="text-gray-200">Generate AI Diagram</span>
                <kbd className="text-[10px] bg-[#222] px-1.5 py-0.5 rounded text-gray-500 border border-white/10">⌘ J</kbd>
              </button>
            </div>

            {/* Canvas element */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{cursor:cursorStyle}}
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick}/>

            {/* Inline text */}
            {inlineText && (
              <textarea ref={inlineInputRef} autoFocus value={inlineText.value} rows={1}
                onChange={e=>{setInlineText(t=>({...t,value:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                onBlur={commitInlineText}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();commitInlineText();}if(e.key==="Escape")setInlineText(null);}}
                onMouseDown={e=>e.stopPropagation()} placeholder="Type here…"
                className="absolute outline-none text-white placeholder-gray-500 resize-none overflow-hidden"
                style={{left:ilx,top:ily,fontSize:`${15*vp.scale}px`,lineHeight:"1.5",minWidth:"160px",maxWidth:"320px",zIndex:40,background:"rgba(15,15,25,0.9)",border:"1.5px solid #3b82f6",borderRadius:"6px",padding:"6px 10px",caretColor:"#60a5fa",color:"#e0e0e0",backdropFilter:"blur(4px)",boxShadow:"0 0 0 3px rgba(59,130,246,0.2)"}}/>
            )}

            {/* Properties panel */}
            {selShape && (
              <div className="absolute top-4 right-4 w-52 rounded-2xl border border-white/[0.07] shadow-2xl p-4 flex flex-col gap-3 z-30" style={{background:"#161616"}} onClick={e=>e.stopPropagation()}>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Properties</div>
                <div className="text-xs text-gray-400 capitalize">{selShape.type}</div>
                <div>
                  <div className="text-[10px] text-gray-600 mb-1.5">Color</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map(c=>(
                      <button key={c} onClick={()=>updateShapeColor(c)} className="w-5 h-5 rounded-full border-2 transition-all"
                        style={{background:c,borderColor:selShape.stroke===c?"#fff":"transparent",boxShadow:selShape.stroke===c?`0 0 0 1px ${c}`:"none"}}/>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600">Custom</span>
                  <input type="color" value={selShape.stroke||"#3b82f6"} onChange={e=>updateShapeColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10"/>
                </div>
                <button onClick={()=>{commitShapes(p=>p.filter((_,i)=>i!==selectedIdx));setSelectedIdx(null);}}
                  className="mt-1 text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1.5 hover:bg-red-900/20 rounded-lg px-2 py-1.5 transition-all">🗑️ Delete shape</button>
              </div>
            )}

            {/* Context menu */}
            {ctxMenu && (
              <div className="absolute rounded-xl shadow-2xl py-1.5 z-50 w-48 border border-white/[0.08]" style={{left:ctxMenu.x,top:ctxMenu.y,background:"#1e1e1e"}} onClick={e=>e.stopPropagation()}>
                {[
                  {label:"✏️ Edit label",action:()=>{const s=shapes[ctxMenu.idx];setInlineText({x:s.x+10,y:s.y+10,value:s.label||s.text||"",editIdx:ctxMenu.idx});setCtxMenu(null);}},
                  {label:"📋 Duplicate",action:()=>{
                    const s=shapes[ctxMenu.idx];
                    const copy=s.type==="pen"?{...s,id:uid(),pts:s.pts.map(p=>({x:p.x+20,y:p.y+20}))}:s.type==="arrow"?{...s,id:uid(),x:s.x+20,y:s.y+20,x2:s.x2+20,y2:s.y2+20}:{...s,id:uid(),x:s.x+20,y:s.y+20};
                    commitShapes(p=>[...p,copy]);setCtxMenu(null);}},
                ].map((item,i)=>(
                  <button key={i} onClick={item.action} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/8 flex items-center gap-2 transition-colors">{item.label}</button>
                ))}
                <div className="h-px bg-white/5 mx-2 my-1"/>
                <button onClick={()=>{commitShapes(p=>p.filter((_,i)=>i!==ctxMenu.idx));setSelectedIdx(null);setCtxMenu(null);}}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-2 transition-colors">🗑️ Delete</button>
              </div>
            )}
          </section>
        )}
      </div>

      <style>{`
        .doc-body{font-size:15px;line-height:1.8;color:#9ca3af;caret-color:#60a5fa;}
        .doc-body:empty:before{content:"Start writing…";color:#2a2a2a;pointer-events:none;}
        .doc-body h1{font-size:2rem;font-weight:900;color:#fff;margin:1.5rem 0 .5rem;line-height:1.2;border-bottom:1px solid #1f1f1f;padding-bottom:.4rem;}
        .doc-body h2{font-size:1.4rem;font-weight:700;color:#e5e7eb;margin:1.2rem 0 .4rem;}
        .doc-body h3{font-size:1.1rem;font-weight:700;color:#d1d5db;margin:1rem 0 .3rem;}
        .doc-body b,.doc-body strong{color:#fff;font-weight:700;}
        .doc-body i,.doc-body em{color:#d1d5db;}
        .doc-body u{text-decoration-color:#6b7280;}
        .doc-body ul{list-style:disc;padding-left:1.6rem;margin:.6rem 0;}
        .doc-body ol{list-style:decimal;padding-left:1.6rem;margin:.6rem 0;}
        .doc-body li{margin-bottom:.3rem;}
        .doc-body hr{border:none;border-top:1px solid #1f1f1f;margin:1.4rem 0;}
        .doc-body p{margin-bottom:.6rem;}
        .doc-body a{color:#60a5fa;text-decoration:underline;}
        .doc-body pre,.doc-body code{font-family:'JetBrains Mono','Fira Code',monospace;font-size:.85em;background:#1e2330;color:#7dd3fc;padding:.1em .45em;border-radius:4px;border:1px solid #2a3040;}
        .doc-body blockquote{border-left:3px solid #3b82f6;padding-left:1rem;color:#6b7280;font-style:italic;margin:.8rem 0;}
      `}</style>
    </div>
  );
}
