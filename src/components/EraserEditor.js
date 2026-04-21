"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Share2, Sparkles, Zap, ChevronLeft,
  MoreHorizontal, Monitor, FileText, Layout,
  MousePointer2, Type, Square, Circle, ArrowRight, Pencil, Trash2,
  Bold, Italic, List, ListOrdered, Heading1, Heading2, Minus,
  Save, CheckCircle2, Loader2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";


const BASE = process.env.NEXT_PUBLIC_API_URL || "https://doc-backend-ouhr.onrender.com";

async function apiFetch(path, token, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function RichToolbar({ editorRef }) {
  const [fontSize, setFontSize] = React.useState("3");

  // Always execute on the docBody contentEditable, restoring selection if needed
  function exec(cmd, val = null) {
    const el = editorRef?.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, val);
  }

  const tools = [
    { icon: Bold,        label: "Bold",          action: () => exec("bold") },
    { icon: Italic,      label: "Italic",        action: () => exec("italic") },
    {
      icon: Heading1, label: "Heading 1",
      action: () => exec("formatBlock", "<h1>"),
    },
    {
      icon: Heading2, label: "Heading 2",
      action: () => exec("formatBlock", "<h2>"),
    },
    { icon: List,        label: "Bullet List",   action: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered List", action: () => exec("insertOrderedList") },
    { icon: Minus,       label: "Divider",       action: () => exec("insertHorizontalRule") },
  ];

  function handleFontSize(e) {
    const val = e.target.value;
    setFontSize(val);
    exec("fontSize", val);
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-[#1a1a1a] border-b border-gray-800 flex-wrap flex-shrink-0">
      {tools.map((t, i) => (
        <button
          key={i}
          onMouseDown={(e) => { e.preventDefault(); t.action(); }}
          title={t.label}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
        >
          <t.icon size={15} />
        </button>
      ))}
      <select
        value={fontSize}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={handleFontSize}
        className="ml-1 bg-[#2a2a2a] border border-gray-700 text-gray-300 text-xs rounded-md px-1.5 py-1 outline-none cursor-pointer"
      >
        {[["1","10px"],["2","12px"],["3","14px"],["4","16px"],["5","18px"],["6","24px"],["7","32px"]].map(([v,label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
      <input
        type="color"
        defaultValue="#e0e0e0"
        title="Text Color"
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => exec("foreColor", e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-700 p-0.5"
      />
    </div>
  );
}

function SaveStatus({ status }) {
  if (status === "saving")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Loader2 size={12} className="animate-spin" /> Saving…
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-green-500">
        <CheckCircle2 size={12} /> Saved
      </span>
    );
  if (status === "unsaved")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-yellow-500">
        <Save size={12} /> Unsaved changes
      </span>
    );
  return null;
}


export default function EraserEditor({ file, onBack }) {
  const { token } = useAuth();

  const [activeTab, setActiveTab]     = useState("both");
  const [activeTool, setActiveTool]   = useState("select");
  // shapes: the canvas drawing data. Pre-loaded from DB if the file has any.
  const [shapes, setShapes]           = useState(() => {
    try { return file?.canvas_data ? JSON.parse(file.canvas_data) : []; }
    catch { return []; }
  });
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [ctxMenu, setCtxMenu]         = useState(null);
  const [inlineText, setInlineText]   = useState(null);
  const [saveStatus, setSaveStatus]   = useState("idle");


  const canvasRef      = useRef(null);
  const isDrawing      = useRef(false);
  const startPos       = useRef({ x: 0, y: 0 });
  const currentPath    = useRef([]);
  const inlineInputRef = useRef(null);
  const shapesRef      = useRef(shapes);
  const selectedIdxRef = useRef(selectedIdx);
  // Ref to the document contentEditable div so we can read its HTML for saving
  const docBodyRef     = useRef(null);
  // Debounce timer for auto-save
  const saveTimer      = useRef(null);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  useEffect(() => {
    if (docBodyRef.current && file?.doc_content) {
      docBodyRef.current.innerHTML = file.doc_content;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called whenever shapes change or document content changes.
  // We debounce by 2 seconds so we don't hammer the DB on every keystroke/draw.
  const scheduleSave = useCallback(() => {
    setSaveStatus("unsaved");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToServer();
    }, 2000); // 2-second debounce
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveToServer() {
    if (!file?.id || !token) return;
    setSaveStatus("saving");
    try {
      await apiFetch(`/api/files/${file.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          // Save the rich-text HTML from contentEditable
          doc_content: docBodyRef.current?.innerHTML || "",
          // Save canvas shapes as a JSON string
          canvas_data: JSON.stringify(shapesRef.current),
        }),
      });
      setSaveStatus("saved");
      // Reset "saved" label back to idle after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("unsaved"); // will retry next change
    }
  }

  // Trigger save whenever shapes change
  useEffect(() => {
    if (shapes.length > 0 || saveStatus === "unsaved") scheduleSave();
  }, [shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  const redrawAllRef = useRef(() => {});

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
    redrawAllRef.current();
  }, []);

  function redrawAll(extra = null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = extra ? [...shapesRef.current, extra] : shapesRef.current;
    all.forEach((s, i) => drawShape(ctx, s, i === selectedIdxRef.current));
  }
  redrawAllRef.current = redrawAll;

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => { redrawAll(); }, [shapes, selectedIdx]);

  useEffect(() => {
    if (inlineText && inlineInputRef.current) {
      // Use rAF to ensure the textarea is painted before focusing
      requestAnimationFrame(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.focus();
          // Move cursor to end of existing text (for edit mode)
          const len = inlineInputRef.current.value.length;
          inlineInputRef.current.setSelectionRange(len, len);
        }
      });
    }
  }, [inlineText]);

  function drawShape(ctx, shape, isSelected = false) {
    ctx.save();
    ctx.strokeStyle = isSelected ? "#60a5fa" : "#3b82f6";
    ctx.lineWidth   = isSelected ? 2.5 : 2;
    ctx.fillStyle   = "rgba(59,130,246,0.08)";

    switch (shape.type) {
      case "rect": {
        const x = Math.min(shape.x, shape.x + shape.w);
        const y = Math.min(shape.y, shape.y + shape.h);
        const w = Math.abs(shape.w), h = Math.abs(shape.h);
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
        if (shape.label) {
          ctx.fillStyle = "#e0e0e0"; ctx.font = "13px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(shape.label, x + w / 2, y + h / 2);
        }
        if (isSelected) drawHandles(ctx, x, y, w, h);
        break;
      }
      case "circle": {
        const cx = shape.x + shape.w / 2, cy = shape.y + shape.h / 2;
        const rx = Math.abs(shape.w / 2), ry = Math.abs(shape.h / 2);
        ctx.beginPath(); ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (isSelected) drawHandles(ctx, shape.x, shape.y, shape.w, shape.h);
        break;
      }
      case "arrow": {
        const angle = Math.atan2(shape.y2 - shape.y, shape.x2 - shape.x);
        ctx.beginPath(); ctx.moveTo(shape.x, shape.y); ctx.lineTo(shape.x2, shape.y2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(shape.x2, shape.y2);
        ctx.lineTo(shape.x2 - 14 * Math.cos(angle - 0.4), shape.y2 - 14 * Math.sin(angle - 0.4));
        ctx.lineTo(shape.x2 - 14 * Math.cos(angle + 0.4), shape.y2 - 14 * Math.sin(angle + 0.4));
        ctx.closePath(); ctx.fillStyle = "#3b82f6"; ctx.fill();
        break;
      }
      case "pen": {
        if (!shape.pts || shape.pts.length < 2) break;
        ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 1.8;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(shape.pts[0].x, shape.pts[0].y);
        shape.pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        break;
      }
      case "text": {
        ctx.fillStyle = shape.color || "#e0e0e0";
        ctx.font = `${shape.fontSize || 15}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(shape.text || "", shape.x, shape.y);
        if (isSelected) {
          const tw = ctx.measureText(shape.text || "").width;
          const th = (shape.fontSize || 15) + 8;
          ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(shape.x - 3, shape.y - 3, tw + 6, th);
          ctx.setLineDash([]);
        }
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  function drawHandles(ctx, x, y, w, h) {
    const pts = [[x,y],[x+w/2,y],[x+w,y],[x,y+h/2],[x+w,y+h/2],[x,y+h],[x+w/2,y+h],[x+w,y+h]];
    ctx.fillStyle = "#3b82f6";
    pts.forEach(([hx, hy]) => { ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); });
  }

  function hitTest(pos) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === "rect") {
        const x = Math.min(s.x, s.x+s.w), y = Math.min(s.y, s.y+s.h);
        if (pos.x>=x && pos.x<=x+Math.abs(s.w) && pos.y>=y && pos.y<=y+Math.abs(s.h)) return i;
      }
      if (s.type === "circle") {
        const x = Math.min(s.x, s.x+s.w), y = Math.min(s.y, s.y+s.h);
        if (pos.x>=x && pos.x<=x+Math.abs(s.w) && pos.y>=y && pos.y<=y+Math.abs(s.h)) return i;
      }
      if (s.type === "text") {
        const ctx = canvasRef.current.getContext("2d");
        ctx.font = `${s.fontSize||15}px sans-serif`;
        const tw = ctx.measureText(s.text||"").width;
        if (pos.x>=s.x-3 && pos.x<=s.x+tw+3 && pos.y>=s.y-3 && pos.y<=s.y+(s.fontSize||15)+8) return i;
      }
      if (s.type === "arrow") {
        const dx=s.x2-s.x, dy=s.y2-s.y;
        const t=Math.max(0,Math.min(1,((pos.x-s.x)*dx+(pos.y-s.y)*dy)/(dx*dx+dy*dy||1)));
        const dist=Math.hypot(pos.x-(s.x+t*dx), pos.y-(s.y+t*dy));
        if (dist < 10) return i;
      }
    }
    return null;
  }

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    setCtxMenu(null);
    const pos = getPos(e);
    if (activeTool === "select") { setSelectedIdx(hitTest(pos)); return; }
    if (activeTool === "text") {
      // Prevent canvas from taking focus so the textarea can receive it
      e.preventDefault();
      setInlineText({ x: pos.x, y: pos.y, value: "" });
      return;
    }
    isDrawing.current = true;
    startPos.current  = pos;
    if (activeTool === "pen") currentPath.current = [pos];
  }

  // Double-click on a shape in select mode → open inline label editor
  function handleDoubleClick(e) {
    if (activeTool !== "select") return;
    const pos = getPos(e);
    const idx = hitTest(pos);
    if (idx === null) return;
    const s = shapes[idx];
    // Position the input at the center of rect/circle, or at shape origin for text/arrow
    let ix = s.x, iy = s.y;
    if (s.type === "rect" || s.type === "circle") {
      ix = s.x + Math.abs(s.w) / 2 - 65;
      iy = s.y + Math.abs(s.h) / 2 - 10;
    }
    setInlineText({
      x: Math.max(4, ix),
      y: Math.max(4, iy),
      value: s.label || s.text || "",
      editIdx: idx,
    });
  }

  function handleMouseMove(e) {
    if (!isDrawing.current) return;
    const pos = getPos(e);
    const { x: sx, y: sy } = startPos.current;
    if (activeTool === "pen") {
      currentPath.current.push(pos);
      redrawAll({ type:"pen", pts:[...currentPath.current] });
      return;
    }
    let preview = null;
    if (activeTool === "rect")   preview = { type:"rect",   x:sx, y:sy, w:pos.x-sx, h:pos.y-sy };
    if (activeTool === "circle") preview = { type:"circle", x:sx, y:sy, w:pos.x-sx, h:pos.y-sy };
    if (activeTool === "arrow")  preview = { type:"arrow",  x:sx, y:sy, x2:pos.x, y2:pos.y };
    if (preview) redrawAll(preview);
  }

  function handleMouseUp(e) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pos = getPos(e);
    const { x: sx, y: sy } = startPos.current;
    let s = null;
    if (activeTool === "rect")   s = { type:"rect",   x:sx, y:sy, w:pos.x-sx, h:pos.y-sy };
    if (activeTool === "circle") s = { type:"circle", x:sx, y:sy, w:pos.x-sx, h:pos.y-sy };
    if (activeTool === "arrow")  s = { type:"arrow",  x:sx, y:sy, x2:pos.x, y2:pos.y };
    if (activeTool === "pen")    s = { type:"pen", pts:[...currentPath.current] };
    if (s) setShapes(prev => [...prev, s]); // triggers useEffect → scheduleSave
  }

  function handleContextMenu(e) {
    e.preventDefault();
    const pos = getPos(e);
    const idx = hitTest(pos);
    if (idx !== null) {
      setSelectedIdx(idx);
      const rect = canvasRef.current.getBoundingClientRect();
      setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, idx });
    } else {
      setCtxMenu(null);
    }
  }

  function ctxDelete() {
    setShapes(prev => prev.filter((_, i) => i !== ctxMenu.idx));
    setSelectedIdx(null); setCtxMenu(null);
  }

  function ctxDuplicate() {
    const s = shapes[ctxMenu.idx];
    let copy;
    if (s.type === "pen")   copy = { ...s, pts: s.pts.map(p=>({x:p.x+20,y:p.y+20})) };
    else if (s.type==="arrow") copy = { ...s, x:s.x+20,y:s.y+20,x2:s.x2+20,y2:s.y2+20 };
    else copy = { ...s, x:s.x+20, y:s.y+20 };
    setShapes(prev => [...prev, copy]);
    setCtxMenu(null);
  }

  function ctxEditLabel() {
    const s = shapes[ctxMenu.idx];
    setInlineText({
      x: (s.x || 0) + 10,
      y: (s.y || 0) + 10,
      value: s.label || s.text || "",
      editIdx: ctxMenu.idx,
    });
    setCtxMenu(null);
  }

  function commitInlineText() {
    if (!inlineText) return;
    const val = inlineText.value.trim();
    if (val) {
      if (inlineText.editIdx !== undefined) {
        setShapes(prev => prev.map((s, i) => {
          if (i !== inlineText.editIdx) return s;
          return s.type === "text" ? { ...s, text: val } : { ...s, label: val };
        }));
      } else {
        setShapes(prev => [...prev, { type:"text", x:inlineText.x, y:inlineText.y, text:val, fontSize:15 }]);
      }
    }
    setInlineText(null);
    // Switch back to select after placing text so user can move/edit it right away
    if (!inlineText?.editIdx) setActiveTool("select");
  }

  useEffect(() => {
    function onKey(e) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdxRef.current !== null) {
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        setShapes(prev => prev.filter((_, i) => i !== selectedIdxRef.current));
        setSelectedIdx(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function clearCanvas() { setShapes([]); setSelectedIdx(null); }

  const tools = [
    { id:"select", icon:MousePointer2 },
    { id:"rect",   icon:Square        },
    { id:"circle", icon:Circle        },
    { id:"arrow",  icon:ArrowRight    },
    { id:"pen",    icon:Pencil        },
    { id:"text",   icon:Type          },
  ];
  const cursorMap = { select:"default", rect:"crosshair", circle:"crosshair", arrow:"crosshair", pen:"crosshair", text:"text" };

  const showDoc    = activeTab === "document" || activeTab === "both";
  const showCanvas = activeTab === "canvas"   || activeTab === "both";

  return (
    <div
      className="flex flex-col h-screen bg-[#121212] text-[#e0e0e0] font-sans overflow-hidden"
      onClick={() => setCtxMenu(null)}
    >
      {/* ── NAVBAR ─*/}
      <nav className="h-12 border-b border-gray-800 flex items-center justify-between px-4 bg-[#1a1a1a] z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="hover:bg-gray-800 p-1 rounded transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-400" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Zap size={14} className="text-white fill-current" />
            </div>
            <span className="text-sm font-medium text-gray-200">{file?.name}</span>
            <MoreHorizontal size={14} className="text-gray-500 cursor-pointer hover:text-gray-300" />
          </div>
          {/* Live save status */}
          <div className="ml-3">
            <SaveStatus status={saveStatus} />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[#121212] border border-gray-800 rounded-lg p-1 gap-1">
          {[
            { id:"document", label:"Document", icon:FileText },
            { id:"both",     label:"Both",     icon:Layout   },
            { id:"canvas",   label:"Canvas",   icon:Monitor  },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                activeTab === tab.id ? "bg-[#2a2a2a] text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <tab.icon size={12} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Manual save button */}
          <button
            onClick={saveToServer}
            className="text-[11px] font-bold border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <Save size={14} /> Save now
          </button>
          <button className="text-[11px] font-bold border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-800 flex items-center gap-2">
            <Share2 size={14} /> Share
          </button>
          <button className="text-[11px] font-bold bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-500 flex items-center gap-2 text-white">
            <Sparkles size={14} /> AI Chat
          </button>
        </div>
      </nav>

      {/* ── CONTENT */}
      <div className="flex flex-1 overflow-hidden">

        {/* Document panel */}
        {showDoc && (
          <section
            className={`flex flex-col h-full bg-[#121212] ${activeTab === "both" ? "w-1/2 border-r border-gray-800" : "w-full"}`}
          >
            <RichToolbar editorRef={docBodyRef} />
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-12 py-8">
                {/* File title — editable, triggers save */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Untitled"
                  className="text-4xl font-black text-white mb-6 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-700"
                  spellCheck={false}
                  onInput={scheduleSave}
                  ref={(el) => {
                    if (el && !el.dataset.initialized) {
                      el.dataset.initialized = "1";
                      el.textContent = file?.name || "";
                    }
                  }}
                />
                {/*
                  Document body — contentEditable.
                  We attach a ref so saveToServer() can read innerHTML.
                  onInput fires scheduleSave on every keystroke.
                  Initial content is set via useEffect (not dangerouslySetInnerHTML)
                  so React doesn't wipe user edits on re-renders.
                */}
                <div
                  ref={docBodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="outline-none min-h-[500px] doc-body"
                  spellCheck={false}
                  onInput={scheduleSave}
                />
              </div>
            </div>
          </section>
        )}

        {/* Canvas panel */}
        {showCanvas && (
          <section
            className={`h-full relative overflow-hidden ${activeTab === "both" ? "flex-1" : "w-full"}`}
            style={{
              background: "#0b0b0b",
              backgroundImage: "radial-gradient(#222 1px,transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {/* Left toolbar */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 bg-[#1a1a1a] border border-gray-800 p-2 rounded-xl shadow-2xl z-20">
              {tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  title={tool.id}
                  className={`p-2 rounded-lg transition-all ${
                    activeTool === tool.id
                      ? "bg-blue-600 text-white"
                      : "hover:bg-gray-800 text-gray-500 hover:text-gray-200"
                  }`}
                >
                  <tool.icon size={18} />
                </button>
              ))}
              <div className="w-full h-px bg-gray-800 my-1" />
              <button
                onClick={clearCanvas}
                title="Clear all"
                className="p-2 rounded-lg hover:bg-red-900/40 text-gray-600 hover:text-red-400 transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* AI generate button */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <button className="pointer-events-auto flex items-center gap-3 bg-[#1a1a1a] border border-gray-700 px-6 py-3 rounded-2xl text-sm font-semibold hover:border-blue-500 transition-all shadow-2xl">
                <Sparkles size={16} className="text-blue-400" />
                <span>Generate AI Diagram</span>
                <kbd className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">CTRL J</kbd>
              </button>
            </div>

            {/* Canvas element */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: cursorMap[activeTool] }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { isDrawing.current = false; }}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleDoubleClick}
            />

            {/* Inline text input — sits ABOVE the canvas (z-40) */}
            {inlineText && (
              <textarea
                ref={inlineInputRef}
                autoFocus
                value={inlineText.value}
                rows={1}
                onChange={e => {
                  setInlineText(t => ({ ...t, value: e.target.value }));
                  // auto-grow rows
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onBlur={commitInlineText}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitInlineText(); }
                  if (e.key === "Escape") { setInlineText(null); }
                }}
                onMouseDown={e => e.stopPropagation()}
                placeholder="Type here…"
                className="absolute outline-none text-white placeholder-gray-500 resize-none overflow-hidden"
                style={{
                  left: inlineText.x,
                  top:  inlineText.y,
                  fontSize: "15px",
                  lineHeight: "1.5",
                  minWidth: "160px",
                  maxWidth: "320px",
                  zIndex: 40,
                  background: "rgba(15,15,25,0.85)",
                  border: "1.5px solid #3b82f6",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  caretColor: "#60a5fa",
                  color: "#e0e0e0",
                  backdropFilter: "blur(4px)",
                  boxShadow: "0 0 0 3px rgba(59,130,246,0.2)",
                }}
              />
            )}

            {/* Context menu */}
            {ctxMenu && (
              <div
                className="absolute bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl py-1.5 z-50 w-44"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={ctxEditLabel}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  ✏️ <span>Edit Label</span>
                </button>
                <button
                  onClick={ctxDuplicate}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  📋 <span>Duplicate</span>
                </button>
                <div className="h-px bg-gray-700 mx-2 my-1" />
                <button
                  onClick={ctxDelete}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-2.5 transition-colors"
                >
                  🗑️ <span>Delete</span>
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <style>{`
        .doc-body { font-size: 15px; line-height: 1.75; color: #9ca3af; caret-color: #60a5fa; }
        .doc-body:empty:before { content: "Start writing…"; color: #374151; pointer-events: none; }
        .doc-body:focus { outline: none; }
        .doc-body h1 { font-size: 2rem; font-weight: 900; color: #ffffff; margin: 1rem 0 0.5rem; line-height: 1.2; }
        .doc-body h2 { font-size: 1.4rem; font-weight: 700; color: #e5e7eb; margin: 0.8rem 0 0.4rem; line-height: 1.3; }
        .doc-body b, .doc-body strong { color: #ffffff; font-weight: 700; }
        .doc-body i, .doc-body em { color: #d1d5db; font-style: italic; }
        .doc-body ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .doc-body ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .doc-body li { margin-bottom: 0.25rem; color: #9ca3af; }
        .doc-body hr { border: none; border-top: 1px solid #374151; margin: 1rem 0; }
        .doc-body p { margin-bottom: 0.5rem; }
        .doc-body div { margin-bottom: 0.25rem; }
      `}</style>
    </div>
  );
}