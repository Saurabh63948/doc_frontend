"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Zap } from "lucide-react";

export default function SignupPage() {
  const [form, setForm]       = useState({ name: "", email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("https://doc-backend-ouhr.onrender.com/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(form),
});
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      login(data.user, data.token);
      router.push("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-gray-800 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-white fill-current" />
          </div>
          <span className="text-white font-bold">Saurabh's Team</span>
        </div>

        <h1 className="text-2xl font-black text-white mb-1">Create account</h1>
        <p className="text-gray-500 text-sm mb-6">Start building with your team</p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-2.5 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {["name", "email", "password"].map((field) => (
            <input
              key={field}
              type={field === "password" ? "password" : field === "email" ? "email" : "text"}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500 transition-all"
            />
          ))}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-blue-400 hover:text-blue-300">Sign in</a>
        </p>
      </div>
    </div>
  );
}