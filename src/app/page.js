"use client"
import Dashboard from "@/components/Dashboard";
import EraserEditor from "@/components/EraserEditor";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import LoginPage from "./login/page";

export default function MainApp() {
  const { user } = useAuth();

  const [view, setView] = useState("dashboard");
  const [activeFile, setActiveFile] = useState(null);

 

  if (!user) return (
    <>
    <LoginPage/>
    </>
  )

  const handleFileSelect = (file) => {
    setActiveFile(file);
    setView("editor");
  };

  return (
    <>
      {view === "dashboard" ? (
        <Dashboard onFileSelect={handleFileSelect} />
      ) : (
        <EraserEditor
          file={activeFile}
          onBack={() => {
            setView("dashboard");
            setActiveFile(null);
          }}
        />
      )}
    </>
  );
}