"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, LayoutGrid, Users, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push("/dashboard");
      }
      setLoading(false);
    };
    checkUser();
  }, [router]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-slate-50 border-b border-slate-200 py-20 px-6">
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full font-black text-xs mb-8">
            <ShieldCheck size={16} />
            منصة إدارة حلقات التحفيظ والدروس
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 leading-[1.2]">
            منصة <span className="text-blue-600">متابع</span> الذكية
          </h1>
          <p className="text-xl text-slate-500 font-bold max-w-2xl mx-auto mb-12">
            أفضل طريقة لمتابعة حضور وغياب طلابك، إرسال التنبيهات، وإدارة حلقاتك التعليمية بكل سهولة واحترافية.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => router.push("/login")}
              className="w-full md:w-auto bg-blue-600 text-white px-10 py-5 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
            >
              ابدأ الآن مجاناً
              <ArrowLeft size={20} />
            </button>
            <button 
              onClick={() => router.push("/login")}
              className="w-full md:w-auto bg-white text-slate-600 px-10 py-5 rounded-2xl font-black text-lg border border-slate-200 hover:bg-slate-50 transition-all"
            >
              تسجيل الدخول
            </button>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-500/5 blur-[120px] -rotate-45 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-blue-600/5 blur-[100px] translate-y-1/2" />
      </header>

      {/* Features */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-10 bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
              <LayoutGrid size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-4">نظام "الحلقات"</h3>
            <p className="text-slate-500 font-bold leading-relaxed">
              قم بإنشاء مساحات عمل (حلقات) منفصلة لكل مجموعة طلاب، مع إعدادات خاصة لكل حلقة.
            </p>
          </div>

          <div className="p-10 bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-6">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-4">متابعة فورية</h3>
            <p className="text-slate-500 font-bold leading-relaxed">
              رصد الحضور والغياب بلمسة واحدة، مع إحصائيات دقيقة لنسب الالتزام الشهرية والعامة.
            </p>
          </div>

          <div className="p-10 bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
              <Users size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-4">تعاون المعلمين</h3>
            <p className="text-slate-500 font-bold leading-relaxed">
              ادعُ معلمين آخرين لمساعدتك في رصد الحضور، مع تحديد صلاحيات دقيقة لكل معلم.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center border-t border-slate-100">
        <p className="text-slate-400 font-bold">© {new Date().getFullYear()} منصة متابع. جميع الحقوق محفوظة.</p>
      </footer>
    </div>
  );
}
