"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { User, Mail, LogOut, Loader2, ChevronRight, Camera, Save, ArrowRight } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Profile {
  full_name: string;
  avatar_url: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newName, setNewName] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      setNewName(data.full_name || "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: newName, updated_at: new Date() })
        .eq("id", user?.id);

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, full_name: newName } : null);
      alert("تم تحديث الملف الشخصي بنجاح");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-10" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-4 py-4 md:px-8">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all"
            >
              <ArrowRight size={20} className="text-slate-600" />
            </button>
            <h1 className="text-xl font-black text-slate-800">الملف الشخصي</h1>
          </div>
          <button 
            onClick={handleSignOut}
            className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all"
            title="تسجيل الخروج"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8 space-y-8">
        {/* Profile Card */}
        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 bg-blue-50 rounded-[28px] flex items-center justify-center text-blue-500 overflow-hidden border-4 border-white shadow-xl">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <User size={40} />
                )}
              </div>
              <button className="absolute -bottom-2 -right-2 p-2 bg-blue-600 text-white rounded-xl shadow-lg border-2 border-white hover:bg-blue-700 transition-all">
                <Camera size={16} />
              </button>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black text-slate-800">{profile?.full_name || "مستخدم"}</h2>
              <p className="text-sm font-bold text-slate-400">{email}</p>
            </div>
          </div>

          <form onSubmit={updateProfile} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">الاسم الكامل</label>
              <div className="relative">
                <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pr-12 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" 
                  placeholder="أدخل اسمك الكامل"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">البريد الإلكتروني (لا يمكن تغييره)</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  disabled
                  type="email" 
                  value={email} 
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pr-12 font-bold text-slate-400 cursor-not-allowed" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={updating || newName === profile?.full_name} 
              className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {updating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              حفظ التغييرات
            </button>
          </form>
        </section>

        {/* Other Settings (Placeholder) */}
        <section className="space-y-4">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">إعدادات الحساب</h2>
          <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden divide-y divide-slate-50">
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-not-allowed transition-all opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                  <Camera size={20} />
                </div>
                <span className="font-bold text-slate-700 text-sm">تغيير الصورة الشخصية</span>
              </div>
              <ChevronRight size={18} className="text-slate-300 rotate-180" />
            </div>
            {/* Add more settings items here */}
          </div>
        </section>
      </main>
    </div>
  );
}
