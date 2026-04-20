"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, Plus, LayoutGrid, Clock, Users,
  ChevronRight, ChevronDown, FolderPlus, Search,
  Trash2, LogOut, Loader2, FolderOpen, Folder,
  MoreVertical, X
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
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
function FileMenu({ file, folders, onDelete, onMoveToFolder, onRemoveFromFolder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl py-1.5 z-50 w-48">
          {folders.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 px-3 pt-1 pb-1 font-bold">
                Move to folder
              </p>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => { onMoveToFolder(file.id, f.id); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                >
                  <Folder size={12} className="text-blue-400 flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
              {file.folder_id && (
                <button
                  onClick={() => { onRemoveFromFolder(file.id); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                >
                  <X size={12} /> Remove from folder
                </button>
              )}
              <div className="h-px bg-gray-700 mx-2 my-1" />
            </>
          )}
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-2 transition-colors"
          >
            <Trash2 size={12} /> Delete file
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ onFileSelect }) {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [search, setSearch]         = useState("");
  const [files, setFiles]           = useState([]);
  const [folders, setFolders]       = useState([]);
  const [activeNav, setActiveNav]   = useState("all");
  const [openFolder, setOpenFolder] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [filesError, setFilesError] = useState("");
  const [dragFileId, setDragFileId] = useState(null);  // currently dragged file id
  const [dragOverFolderId, setDragOverFolderId] = useState(null); // folder being hovered

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const fetchFiles = apiFetch("/api/files", token)
      .then(data => setFiles(Array.isArray(data) ? data : []))
      .catch(e => setFilesError(e.message));
    const fetchFolders = apiFetch("/api/folders", token)
      .then(data => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([])); // silently fail — add folders table if missing
    Promise.all([fetchFiles, fetchFolders]).finally(() => setLoading(false));
  }, [token]);


  const visibleFiles = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const rootFiles      = visibleFiles.filter(f => !f.folder_id);
  const filesInFolder  = (fid) => visibleFiles.filter(f => f.folder_id === fid);
  async function createNewFile(folderId = null) {
    const name = window.prompt("File name:", "Untitled Diagram");
    if (!name) return;
    try {
      const newFile = await apiFetch("/api/files", token, {
        method: "POST",
        body: JSON.stringify({ name, icon: "⚡", folder_id: folderId }),
      });
      setFiles(prev => [newFile, ...prev]);
      onFileSelect(newFile);
    } catch (e) { alert("Could not create file: " + e.message); }
  }

  async function deleteFile(id) {
    if (!window.confirm("Delete this file?")) return;
    try {
      await apiFetch(`/api/files/${id}`, token, { method: "DELETE" });
      setFiles(prev => prev.filter(f => f.id !== id));
    } catch (e) { alert("Could not delete: " + e.message); }
  }

  async function moveToFolder(fileId, folderId) {
    try {
      await apiFetch(`/api/files/${fileId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ folder_id: folderId }),
      });
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: folderId } : f));
    } catch (e) { alert("Could not move: " + e.message); }
  }

  async function removeFromFolder(fileId) {
    try {
      await apiFetch(`/api/files/${fileId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ folder_id: null }),
      });
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: null } : f));
    } catch (e) { alert(e.message); }
  }

  async function createFolder() {
    const name = window.prompt("Folder name:");
    if (!name) return;
    try {
      const folder = await apiFetch("/api/folders", token, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setFolders(prev => [...prev, folder]);
    } catch (e) { alert("Could not create folder: " + e.message); }
  }

  async function deleteFolder(id, e) {
    e.stopPropagation();
    if (!window.confirm("Delete folder? Files inside move to root.")) return;
    try {
      await apiFetch(`/api/folders/${id}`, token, { method: "DELETE" });
      setFolders(prev => prev.filter(f => f.id !== id));
      setFiles(prev => prev.map(f => f.folder_id === id ? { ...f, folder_id: null } : f));
    } catch (e) { alert(e.message); }
  }

  function handleLogout() { logout(); router.push("/login"); }
  function onDragStart(e, fileId) {
    setDragFileId(fileId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fileId);
  }

  function onDragEnd() {
    setDragFileId(null);
    setDragOverFolderId(null);
  }

  function onFolderDragOver(e, folderId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  }

  function onFolderDragLeave() {
    setDragOverFolderId(null);
  }

  async function onFolderDrop(e, folderId) {
    e.preventDefault();
    const fileId = dragFileId || e.dataTransfer.getData("text/plain");
    setDragFileId(null);
    setDragOverFolderId(null);
    if (!fileId) return;
    const file = files.find(f => String(f.id) === String(fileId));
    if (!file || file.folder_id === folderId) return;
    await moveToFolder(fileId, folderId);
  }

  // Drop onto root area (removes from folder)
  function onRootDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId("root");
  }

  async function onRootDrop(e) {
    e.preventDefault();
    const fileId = dragFileId || e.dataTransfer.getData("text/plain");
    setDragFileId(null);
    setDragOverFolderId(null);
    if (!fileId) return;
    const file = files.find(f => String(f.id) === String(fileId));
    if (!file || !file.folder_id) return;
    await removeFromFolder(fileId);
  }

  if (!token) return null;
  const FileCard = ({ file }) => (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, file.id)}
      onDragEnd={onDragEnd}
      onClick={() => onFileSelect(file)}
      className={`h-44 bg-[#1a1a1a] border rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all group relative select-none ${
        dragFileId === file.id
          ? "opacity-40 border-blue-500 scale-95"
          : "border-gray-800 hover:border-blue-500/50"
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center text-lg">
          {file.icon || "⚡"}
        </div>
        <FileMenu
          file={file}
          folders={folders}
          onDelete={() => deleteFile(file.id)}
          onMoveToFolder={moveToFolder}
          onRemoveFromFolder={removeFromFolder}
        />
      </div>
      <div>
        <h3 className="text-white font-semibold text-sm mb-1 truncate">{file.name}</h3>
        {file.folder_id && (
          <p className="text-[9px] text-blue-500 mb-0.5 flex items-center gap-1">
            <Folder size={9} />
            {folders.find(f => f.id === file.folder_id)?.name}
          </p>
        )}
        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
          {file.updated_at
            ? `Edited ${new Date(file.updated_at).toLocaleDateString("en-IN")}`
            : "Just created"}
        </p>
      </div>
    </div>
  );
  return (
    <div className="flex h-screen bg-[#121212] text-gray-300 font-sans">

      {/* SIDEBAR */}
      <aside className="w-60 border-r border-gray-800 flex flex-col p-4 bg-[#161616] flex-shrink-0">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={18} className="text-white fill-current" />
          </div>
          <span className="font-bold text-white tracking-tight text-sm truncate">
            {user?.name ? `${user.name}'s Team` : "My Team"}
          </span>
        </div>

        <button
          onClick={() => createNewFile(null)}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl flex items-center justify-center gap-2 mb-8 transition-all font-semibold text-sm"
        >
          <Plus size={16} /> New File
        </button>

        <nav className="space-y-1 flex-1 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold px-2 mb-2">Workspace</p>
          {[
            { id: "all",     icon: LayoutGrid, label: "All Files" },
            { id: "recents", icon: Clock,      label: "Recents"   },
            { id: "shared",  icon: Users,      label: "Shared"    },
          ].map(item => (
            <div
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                activeNav === item.id ? "bg-gray-800 text-white" : "hover:bg-gray-800/50 text-gray-400"
              }`}
            >
              <item.icon size={15} /> {item.label}
            </div>
          ))}

          {/* Folders in sidebar */}
          <div className="pt-6">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold px-2 mb-2 flex justify-between items-center">
              Folders
              <button onClick={createFolder} title="New folder">
                <FolderPlus size={13} className="cursor-pointer hover:text-white transition-colors" />
              </button>
            </div>

            {folders.length === 0 && (
              <p className="text-[11px] text-gray-700 px-3 py-1">No folders yet</p>
            )}

            {folders.map(folder => {
              const isOpen = openFolder === folder.id;
              const count  = files.filter(f => f.folder_id === folder.id).length;
              return (
                <div key={folder.id}>
                  <div
                    onClick={() => setOpenFolder(isOpen ? null : folder.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800/50 cursor-pointer group text-sm text-gray-400"
                  >
                    {isOpen ? <ChevronDown size={11} className="flex-shrink-0" /> : <ChevronRight size={11} className="flex-shrink-0" />}
                    {isOpen ? <FolderOpen size={13} className="text-blue-400 flex-shrink-0" /> : <Folder size={13} className="text-gray-500 flex-shrink-0" />}
                    <span className="truncate flex-1">{folder.name}</span>
                    <span className="text-[10px] text-gray-600 mr-1">{count}</span>
                    <button
                      onClick={(e) => deleteFolder(folder.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all"
                    >
                      <X size={10} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="ml-5 mb-1">
                      {files.filter(f => f.folder_id === folder.id).map(f => (
                        <div
                          key={f.id}
                          onClick={() => onFileSelect(f)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/50 cursor-pointer text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          <span className="text-base leading-none">{f.icon || "⚡"}</span>
                          <span className="truncate">{f.name}</span>
                        </div>
                      ))}
                      <button
                        onClick={() => createNewFile(folder.id)}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-blue-900/20 text-xs text-gray-600 hover:text-blue-400 transition-colors w-full"
                      >
                        <Plus size={10} /> Add file here
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* User + logout */}
        <div className="border-t border-gray-800 pt-4 mt-4 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-semibold truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} title="Logout" className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-600 hover:text-red-400 transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-8 bg-[#121212] flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-800/40 px-3 py-1.5 rounded-xl border border-gray-700 w-80 focus-within:border-blue-500 transition-all">
            <Search size={14} className="text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-sm w-full text-gray-200 placeholder-gray-600"
              placeholder="Search files..."
            />
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white select-none">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
        </header>

        <section className="p-10 flex-1 overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-1">All Files</h2>
          <p className="text-xs text-gray-600 mb-8">
            {user?.email} · {files.length} file{files.length !== 1 ? "s" : ""}
          </p>

          {filesError && (
            <div className="mb-6 bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3">
              ⚠️ {filesError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-600">
              <Loader2 size={28} className="animate-spin mr-3" />
              <span className="text-sm">Loading your files…</span>
            </div>
          ) : (
            <div className="space-y-10">

              {/* Root files */}
              <div
                onDragOver={onRootDragOver}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={onRootDrop}
                className={`rounded-2xl transition-colors ${dragOverFolderId === "root" ? "ring-2 ring-blue-500/40 bg-blue-500/5" : ""}`}
              >
                {folders.length > 0 && rootFiles.length > 0 && (
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                    Root Files
                  </h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  <div
                    onClick={() => createNewFile(null)}
                    className="h-44 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer transition-all group"
                  >
                    <div className="p-3 bg-gray-800 rounded-full group-hover:bg-blue-600 transition-colors">
                      <Plus size={22} className="text-white" />
                    </div>
                    <span className="text-sm font-medium text-gray-500 group-hover:text-white transition-colors">
                      Create a Blank File
                    </span>
                  </div>

                  {rootFiles.map(file => <FileCard key={file.id} file={file} />)}
                </div>

                {files.length === 0 && !search && (
                  <p className="text-gray-600 text-sm mt-8 text-center">
                    No files yet. Hit &quot;New File&quot; to get started!
                  </p>
                )}
              </div>

              {/* Folder sections */}
              {folders.map(folder => {
                const fFiles = filesInFolder(folder.id);
                const isDropTarget = dragOverFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    onDragOver={(e) => onFolderDragOver(e, folder.id)}
                    onDragLeave={onFolderDragLeave}
                    onDrop={(e) => onFolderDrop(e, folder.id)}
                    className={`rounded-2xl p-3 -mx-3 transition-all ${isDropTarget ? "ring-2 ring-blue-500 bg-blue-500/10" : ""}`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <FolderOpen size={16} className={isDropTarget ? "text-blue-300" : "text-blue-400"} />
                      <h3 className="text-sm font-bold text-white">{folder.name}</h3>
                      <span className="text-xs text-gray-600">{fFiles.length} file{fFiles.length !== 1 ? "s" : ""}</span>
                      {isDropTarget && (
                        <span className="text-xs text-blue-400 font-semibold animate-pulse">Drop to move here</span>
                      )}
                      <button
                        onClick={() => createNewFile(folder.id)}
                        className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-blue-400 border border-gray-700 hover:border-blue-500/50 px-2 py-1 rounded-lg transition-colors"
                      >
                        <Plus size={11} /> Add file
                      </button>
                    </div>

                    {fFiles.length === 0 ? (
                      <div
                        onClick={() => createNewFile(folder.id)}
                        className="h-20 border-2 border-dashed border-gray-800 rounded-2xl flex items-center justify-center gap-2 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer transition-all text-gray-600 text-sm group"
                      >
                        <Plus size={13} className="group-hover:text-blue-400" />
                        <span className="group-hover:text-blue-400">Add first file to {folder.name}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {fFiles.map(file => <FileCard key={file.id} file={file} />)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Search empty state */}
              {search && visibleFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                  <Search size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">No files match &quot;{search}&quot;</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}