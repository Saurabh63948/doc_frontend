"use client";



import React, {
  useState, useRef, useEffect, useCallback,
} from "react";
import {
  Stage, Layer, Rect, Ellipse, Line, Text,
  Arrow, RegularPolygon, Transformer, Group,
} from "react-konva";

// ─── Color palette ────────────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6","#22c55e","#f59e0b","#ef4444","#a855f7",
  "#06b6d4","#ec4899","#f97316","#e0e0e0","#64748b",
];

const STROKE = "#3b82f6";
const FILL   = "rgba(59,130,246,0.06)";
const STROKE_W = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function snapToGrid(val, grid = 20) {
  return Math.round(val / grid) * grid;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── KonvaCanvas ─────────────────────────────────────────────────────────────
export default function KonvaCanvas({ shapes, setShapes, activeTool, setActiveTool }) {
  const stageRef      = useRef(null);
  const trRef         = useRef(null);
  const layerRef      = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [stagePos,    setStagePos]    = useState({ x: 0, y: 0 });
  const [stageScale,  setStageScale]  = useState(1);
  const [isPanning,   setIsPanning]   = useState(false);
  const [panStart,    setPanStart]    = useState(null);

  // Drawing state
  const isDrawing   = useRef(false);
  const drawStart   = useRef(null);
  const currentPen  = useRef([]);
  const [draftShape, setDraftShape] = useState(null);

  // Undo stack
  const history = useRef([JSON.stringify([])]);
  const histIdx  = useRef(0);

  // ── push to undo history ────────────────────────────────────────────────────
  const pushHistory = useCallback((newShapes) => {
    const serialized = JSON.stringify(newShapes);
    history.current = history.current.slice(0, histIdx.current + 1);
    history.current.push(serialized);
    histIdx.current = history.current.length - 1;
  }, []);

  function commitShapes(fn) {
    setShapes(prev => {
      const next = fn(prev);
      pushHistory(next);
      return next;
    });
  }

  // ── keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = { v:"select", r:"rect", o:"circle", d:"diamond", a:"arrow", p:"pen", t:"text" };
    function onKey(e) {
      if (e.target.isContentEditable || ["INPUT","TEXTAREA"].includes(e.target.tagName)) return;

      const key = e.key.toLowerCase();
      if (map[key]) { setActiveTool(map[key]); setSelectedIds([]); return; }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        commitShapes(prev => prev.filter(s => !selectedIds.includes(s.id)));
        setSelectedIds([]);
        return;
      }

      // Undo
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
        if (histIdx.current > 0) {
          histIdx.current--;
          setShapes(JSON.parse(history.current[histIdx.current]));
        }
        return;
      }
      // Redo
      if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) {
        if (histIdx.current < history.current.length - 1) {
          histIdx.current++;
          setShapes(JSON.parse(history.current[histIdx.current]));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds]); // eslint-disable-line

  // ── sync Transformer to selection ─────────────────────────────────────────
  useEffect(() => {
    if (!trRef.current || !layerRef.current) return;
    const nodes = selectedIds
      .map(id => layerRef.current.findOne("#" + id))
      .filter(Boolean);
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedIds, shapes]);

  // ── stage pointer helpers ─────────────────────────────────────────────────
  function getStagePos(e) {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    return {
      x: (pointer.x - stagePos.x) / stageScale,
      y: (pointer.y - stagePos.y) / stageScale,
    };
  }

  // ── zoom ─────────────────────────────────────────────────────────────────
  function handleWheel(e) {
    e.evt.preventDefault();
    const stage   = stageRef.current;
    const oldScale = stageScale;
    const pointer  = stage.getPointerPosition();
    const scaleBy  = 1.08;
    const newScale = e.evt.deltaY < 0
      ? Math.min(oldScale * scaleBy, 5)
      : Math.max(oldScale / scaleBy, 0.2);

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  // ── pan (middle mouse / space+drag) ────────────────────────────────────────
  function handleStageMouseDown(e) {
    if (e.evt.button === 1) { // middle click
      setIsPanning(true);
      setPanStart({ x: e.evt.clientX - stagePos.x, y: e.evt.clientY - stagePos.y });
      return;
    }
    if (activeTool === "select") {
      // Clicking empty stage → deselect
      if (e.target === stageRef.current) setSelectedIds([]);
      return;
    }
    if (activeTool === "text") {
      const pos = getStagePos(e);
      const id  = uid();
      commitShapes(prev => [...prev, {
        id, type:"text", x:pos.x, y:pos.y,
        text:"Double-click to edit",
        fontSize:16, fill:"#e0e0e0", draggable:true,
      }]);
      setActiveTool("select");
      return;
    }
    // Drawing starts
    isDrawing.current = true;
    const pos = getStagePos(e);
    drawStart.current = pos;
    if (activeTool === "pen") currentPen.current = [pos.x, pos.y];
  }

  function handleStageMouseMove(e) {
    if (isPanning && panStart) {
      setStagePos({
        x: e.evt.clientX - panStart.x,
        y: e.evt.clientY - panStart.y,
      });
      return;
    }
    if (!isDrawing.current || !drawStart.current) return;
    const pos = getStagePos(e);
    const { x:sx, y:sy } = drawStart.current;

    if (activeTool === "pen") {
      currentPen.current = [...currentPen.current, pos.x, pos.y];
      setDraftShape({ type:"pen", points: currentPen.current });
      return;
    }

    let snap = e.evt.shiftKey;
    let w = pos.x - sx, h = pos.y - sy;
    if (snap) { const side = Math.min(Math.abs(w),Math.abs(h)); w = Math.sign(w)*side; h = Math.sign(h)*side; }

    const draft = buildShapeDraft(activeTool, sx, sy, w, h, pos);
    setDraftShape(draft);
  }

  function handleStageMouseUp(e) {
    setIsPanning(false);
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (draftShape) {
      const id = uid();
      let finalShape = { ...draftShape, id, draggable: true };
      // Minimum size guard
      if (finalShape.type === "rect" || finalShape.type === "diamond") {
        if (Math.abs(finalShape.width) < 10 || Math.abs(finalShape.height) < 10) {
          setDraftShape(null); return;
        }
      }
      commitShapes(prev => [...prev, finalShape]);
      setSelectedIds([id]);
      if (activeTool !== "pen") setActiveTool("select");
    }
    setDraftShape(null);
    currentPen.current = [];
  }

  // ── shape interaction ─────────────────────────────────────────────────────
  function handleShapeClick(e, id) {
    if (activeTool !== "select") return;
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(i=>i!==id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }

  function handleShapeDragEnd(e, id) {
    const node = e.target;
    commitShapes(prev => prev.map(s =>
      s.id === id ? { ...s, x: node.x(), y: node.y() } : s
    ));
  }

  function handleTransformEnd(e, id) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    commitShapes(prev => prev.map(s => {
      if (s.id !== id) return s;
      if (s.type === "rect" || s.type === "diamond") {
        return { ...s,
          x: node.x(), y: node.y(),
          width:  Math.max(10, s.width  * scaleX),
          height: Math.max(10, s.height * scaleY),
          rotation: node.rotation(),
        };
      }
      if (s.type === "circle") {
        return { ...s,
          x: node.x(), y: node.y(),
          radiusX: Math.max(5, s.radiusX * scaleX),
          radiusY: Math.max(5, s.radiusY * scaleY),
          rotation: node.rotation(),
        };
      }
      return { ...s, x:node.x(), y:node.y() };
    }));
  }

  function handleTextDblClick(id, node) {
    const text = prompt("Edit text:", node.text());
    if (text !== null) {
      commitShapes(prev => prev.map(s => s.id === id ? { ...s, text } : s));
    }
  }

  // ── color update from properties panel ────────────────────────────────────
  function updateColor(id, stroke) {
    commitShapes(prev => prev.map(s => s.id === id ? { ...s, stroke } : s));
  }

  // ── selected shape for properties ─────────────────────────────────────────
  const selShape = selectedIds.length === 1
    ? shapes.find(s => s.id === selectedIds[0])
    : null;

  const cursorMap = {
    select:"default", rect:"crosshair", circle:"crosshair",
    diamond:"crosshair", arrow:"crosshair", pen:"crosshair", text:"text",
  };

  return (
    <div className="absolute inset-0" style={{ cursor: cursorMap[activeTool] }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer ref={layerRef}>
          {/* ── Committed shapes ──────────────────────────────────────── */}
          {shapes.map(s => (
            <ShapeNode
              key={s.id}
              shape={s}
              isSelected={selectedIds.includes(s.id)}
              activeTool={activeTool}
              onClick={(e) => handleShapeClick(e, s.id)}
              onDragEnd={(e) => handleShapeDragEnd(e, s.id)}
              onTransformEnd={(e) => handleTransformEnd(e, s.id)}
              onDblClick={(node) => handleTextDblClick(s.id, node)}
            />
          ))}

          {/* ── Draft shape while drawing ─────────────────────────────── */}
          {draftShape && <ShapeNode shape={{ ...draftShape, id:"draft" }} isSelected={false} />}

          {/* ── Transformer ───────────────────────────────────────────── */}
          <Transformer
            ref={trRef}
            rotateEnabled
            borderStroke="#3b82f6"
            borderStrokeWidth={1.5}
            anchorFill="#fff"
            anchorStroke="#3b82f6"
            anchorSize={8}
            anchorCornerRadius={2}
            boundBoxFunc={(old, nw) => ({
              ...nw,
              width:  Math.max(10, nw.width),
              height: Math.max(10, nw.height),
            })}
          />
        </Layer>
      </Stage>

      {/* ── Properties panel ──────────────────────────────────────────── */}
      {selShape && (
        <PropertiesPanel
          shape={selShape}
          onChange={(stroke) => updateColor(selShape.id, stroke)}
          onDelete={() => {
            commitShapes(prev => prev.filter(s => s.id !== selShape.id));
            setSelectedIds([]);
          }}
        />
      )}

      {/* ── Zoom controls ─────────────────────────────────────────────── */}
      <div
        className="absolute bottom-6 right-6 flex items-center gap-1 p-1.5 rounded-xl border border-white/[0.06] shadow-xl"
        style={{ background:"#161616" }}
      >
        <button onClick={()=>setStageScale(s=>Math.min(s*1.2,5))}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all">
          <ZoomIn size={15}/>
        </button>
        <span className="text-[11px] text-gray-500 w-10 text-center font-mono">
          {Math.round(stageScale*100)}%
        </span>
        <button onClick={()=>setStageScale(s=>Math.max(s/1.2,0.2))}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all">
          <ZoomOut size={15}/>
        </button>
        <div className="w-px h-4 bg-white/10 mx-1"/>
        <button onClick={()=>{setStageScale(1);setStagePos({x:0,y:0});}}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all">
          <RotateCcw size={14}/>
        </button>
      </div>
    </div>
  );
}

// ─── Build draft shape from mouse delta ──────────────────────────────────────
function buildShapeDraft(tool, sx, sy, w, h, pos) {
  if (tool === "rect")    return { type:"rect",    x:sx+Math.min(0,w), y:sy+Math.min(0,h), width:Math.abs(w), height:Math.abs(h), stroke:STROKE, fill:FILL, strokeWidth:STROKE_W };
  if (tool === "circle")  return { type:"circle",  x:sx+w/2, y:sy+h/2, radiusX:Math.abs(w/2), radiusY:Math.abs(h/2), stroke:STROKE, fill:FILL, strokeWidth:STROKE_W };
  if (tool === "diamond") return { type:"diamond", x:sx+Math.min(0,w), y:sy+Math.min(0,h), width:Math.abs(w), height:Math.abs(h), stroke:STROKE, fill:FILL, strokeWidth:STROKE_W };
  if (tool === "arrow")   return { type:"arrow",   points:[sx,sy,pos.x,pos.y], stroke:STROKE, strokeWidth:STROKE_W };
  return null;
}

// ─── ShapeNode — renders one shape via Konva primitives ──────────────────────
function ShapeNode({ shape, isSelected, activeTool, onClick, onDragEnd, onTransformEnd, onDblClick }) {
  const common = {
    id: shape.id,
    draggable: activeTool === "select" && shape.draggable !== false,
    onClick,
    onDragEnd,
    onTransformEnd,
    stroke: shape.stroke || STROKE,
    strokeWidth: isSelected ? (shape.strokeWidth||STROKE_W)+0.5 : (shape.strokeWidth||STROKE_W),
    shadowColor: isSelected ? "#3b82f6" : "transparent",
    shadowBlur:  isSelected ? 12 : 0,
    shadowOpacity: 0.4,
  };

  switch (shape.type) {
    case "rect":
      return (
        <Rect
          {...common}
          x={shape.x} y={shape.y}
          width={shape.width} height={shape.height}
          fill={shape.fill || FILL}
          cornerRadius={8}
          rotation={shape.rotation || 0}
        />
      );

    case "circle":
      return (
        <Ellipse
          {...common}
          x={shape.x} y={shape.y}
          radiusX={shape.radiusX} radiusY={shape.radiusY}
          fill={shape.fill || FILL}
          rotation={shape.rotation || 0}
        />
      );

    case "diamond": {
      const cx = shape.x + shape.width/2;
      const cy = shape.y + shape.height/2;
      const pts = [
        cx, shape.y,
        shape.x+shape.width, cy,
        cx, shape.y+shape.height,
        shape.x, cy,
      ];
      return (
        <Line
          {...common}
          points={pts}
          closed
          fill={shape.fill || FILL}
          rotation={shape.rotation || 0}
          x={0} y={0}
        />
      );
    }

    case "arrow":
      return (
        <Arrow
          {...common}
          points={shape.points}
          fill={shape.stroke || STROKE}
          pointerLength={12}
          pointerWidth={10}
          x={0} y={0}
          draggable={false}
        />
      );

    case "pen":
      return (
        <Line
          {...common}
          points={shape.points || []}
          stroke={shape.stroke || "#e0e0e0"}
          strokeWidth={shape.strokeWidth || 2}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          fill={undefined}
          x={shape.x||0} y={shape.y||0}
        />
      );

    case "text":
      return (
        <Text
          {...common}
          x={shape.x} y={shape.y}
          text={shape.text || ""}
          fontSize={shape.fontSize || 16}
          fill={shape.fill || "#e0e0e0"}
          stroke={undefined}
          strokeWidth={0}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          onDblClick={(e) => onDblClick && onDblClick(e.target)}
        />
      );

    default:
      return null;
  }
}

// ─── Properties panel (floating) ─────────────────────────────────────────────
function PropertiesPanel({ shape, onChange, onDelete }) {
  return (
    <div
      className="absolute top-4 right-4 w-52 rounded-2xl border border-white/[0.07] shadow-2xl p-4 flex flex-col gap-3 z-30"
      style={{ background: "#161616" }}
    >
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
        Properties
      </div>

      {/* Shape type */}
      <div className="text-xs text-gray-500 capitalize">{shape.type}</div>

      {/* Color palette */}
      <div>
        <div className="text-[10px] text-gray-600 mb-1.5">Stroke color</div>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map(c => (
            <button
              key={c}
              onClick={() => onChange(c)}
              className="w-5 h-5 rounded-full border-2 transition-all"
              style={{
                background: c,
                borderColor: shape.stroke === c ? "#fff" : "transparent",
                boxShadow: shape.stroke === c ? `0 0 0 1px ${c}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Custom color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-600">Custom</label>
        <input
          type="color"
          value={shape.stroke || STROKE}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10"
        />
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="mt-1 text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1.5
          hover:bg-red-900/20 rounded-lg px-2 py-1.5 transition-all"
      >
        🗑️ Delete shape
      </button>
    </div>
  );
}
