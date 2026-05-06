"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AuthView = "login" | "signup" | "forgot-password" | "update-password";

function AuthContent() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const router = useRouter();

  // Handle views from URL (e.g. after password reset link click)
  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "reset-password") setView("update-password");
  }, [searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevention for multiple clicks

    setLoading(true);
    setMessage(null);

    try {
      if (view === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else if (view === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) throw error;
        setMessage({ type: "success", text: "تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتفعيله." });
      } else if (view === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login?view=reset-password`,
        });
        if (error) throw error;
        setMessage({ type: "success", text: "تم إرسال رابط استعادة كلمة المرور لبريدك." });
      } else if (view === "update-password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage({ type: "success", text: "تم تحديث كلمة المرور بنجاح! يمكنك الدخول الآن." });
        setTimeout(() => setView("login"), 2000);
      }
    } catch (err: any) {
      // Localized error messages
      let errorMsg = err.message;
      if (err.message.includes("rate limit")) errorMsg = "تجاوزت الحد المسموح للإرسال. يرجى الانتظار قليلاً قبل المحاولة مجدداً.";
      if (err.message.includes("Invalid login")) errorMsg = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
      
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      }
    });
    if (error) setMessage({ type: "error", text: error.message });
    setLoading(false);
  };

  return (
    <div className="max-w-md w-full relative z-10 animate-in fade-in duration-500">
      <div className="text-center mb-10">
        <div className="w-20 h-20 bg-blue-600 rounded-[28px] flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-200 mb-6 transition-transform hover:scale-105">
          <CheckCircle2 size={40} strokeWidth={2.5} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2">منصة متابع</h1>
        <p className="text-slate-500 font-bold">إدارة الحلقات التعليمية بكل احترافية</p>
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        {view !== "update-password" && view !== "forgot-password" && (
          <div className="flex border-b border-slate-50 p-2 bg-slate-50/50">
            <button 
              disabled={loading}
              onClick={() => { setView("login"); setMessage(null); }}
              className={cn("flex-1 py-4 rounded-[24px] font-black text-sm transition-all", view === "login" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
            >
              دخول
            </button>
            <button 
              disabled={loading}
              onClick={() => { setView("signup"); setMessage(null); }}
              className={cn("flex-1 py-4 rounded-[24px] font-black text-sm transition-all", view === "signup" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
            >
              حساب جديد
            </button>
          </div>
        )}

        <div className="p-8 md:p-10">
          {message && (
            <div className={cn("p-4 rounded-2xl mb-6 flex items-center gap-3 text-sm font-bold border animate-in slide-in-from-top-2", message.type === "error" ? "bg-red-50 text-red-600 border-red-100" : "bg-green-50 text-green-600 border-green-100")}>
              {message.type === "error" ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              <p className="leading-relaxed">{message.text}</p>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-6">
            {view === "signup" && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">الاسم الكامل</label>
                <div className="relative">
                  <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الثلاثي" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pr-12 pl-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>
              </div>
            )}

            {view !== "update-password" && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pr-12 pl-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>
              </div>
            )}

            {view !== "forgot-password" && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 flex justify-between">
                  <span>{view === "update-password" ? "كلمة المرور الجديدة" : "كلمة المرور"}</span>
                  {view === "login" && (
                    <button type="button" onClick={() => setView("forgot-password")} className="text-blue-500 hover:underline">نسيت كلمة المرور؟</button>
                  )}
                </label>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pr-12 pl-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>
              </div>
            )}

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : (
                  <>
                    <span>
                      {view === "login" ? "تسجيل الدخول" : view === "signup" ? "إنشاء حساب" : view === "forgot-password" ? "إرسال رابط الاستعادة" : "تحديث كلمة المرور"}
                    </span>
                    <ArrowRight size={20} className="rotate-180" />
                  </>
                )}
              </button>

              {view !== "update-password" && view !== "forgot-password" && (
                <>
                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-slate-400 font-bold text-xs uppercase">أو</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <button 
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={loading}
                    className="w-full bg-white border border-slate-200 text-slate-600 font-black py-5 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.18 1-.78 1.85-1.63 2.42v2.85h2.64c1.68-1.55 2.63-3.84 2.63-6.28z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-2.64-2.85c-.5.34-1.14.55-1.98.55-1.52 0-2.81-1.02-3.27-2.4H3.75v2.33C5.59 20.74 8.6 23 12 23z" fill="#34A853"/>
                      <path d="M8.73 15.64c-.12-.35-.19-.72-.19-1.11s.07-.77.19-1.11V11.1H3.75c-.41.84-.65 1.78-.65 2.8s.24 1.96.65 2.8l4.98-2.26z" fill="#FBBC05"/>
                      <path d="M12 4.93c1.62 0 3.08.56 4.22 1.66l3.17-3.17C17.45 1.55 14.97.5 12 .5 8.6.5 5.59 2.76 3.75 6.07l4.98 2.33c.46-1.38 1.75-2.4 3.27-2.4z" fill="#EA4335"/>
                    </svg>
                    <span>الدخول باستخدام جوجل</span>
                  </button>
                </>
              )}
            {(view === "forgot-password" || view === "update-password") && (
              <button type="button" onClick={() => setView("login")} className="w-full text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors">العودة لتسجيل الدخول</button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans" dir="rtl">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full" />
      </div>

      <Suspense fallback={<Loader2 className="animate-spin text-blue-600" size={48} />}>
        <AuthContent />
      </Suspense>
    </div>
  );
}
