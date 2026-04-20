"use client"
import Dashboard from "@/components/Dashboard";
import EraserEditor from "@/components/EraserEditor";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { useState } from "react";

export default function MainApp() {
  const { user } = useAuth();
  const router = useRouter();
  const [view, setView] = useState("dashboard");
  const [activeFile, setActiveFile] = useState(null);

 

 useEffect(() => {
    if (!user) {
      router.push("/login"); 
    }
  }, [user, router]);

  if (!user) return null; 

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