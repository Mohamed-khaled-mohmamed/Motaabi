"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Plus, Users, User, LogOut, Loader2, LayoutGrid, Mail, Check, X, Archive, History, ChevronRight } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Halqa {
  id: string;
  name: string;
  created_at: string;
  role?: string;
}

interface Invitation {
  id: string;
  halqa_id: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected';
  halqas?: { name: string } | null;
}

export default function Dashboard() {
  const [halqas, setHalqas] = useState<Halqa[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [archivedInvites, setArchivedInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHalqaName, setNewHalqaName] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();

    // Auto refresh if they are removed from a halqa or a halqa is deleted
    const channel = supabase
      .channel('dashboard_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'halqa_members' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'halqas' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: membersData } = await supabase.from("halqa_members").select(`role, halqas ( id, name, created_at )`).eq("user_id", user.id);
      let finalHalqas = [];
      if (membersData) {
        finalHalqas = membersData.map((m: any) => ({ ...m.halqas, role: m.role })).filter(h => h.id);
      }

      const { data: inviteData } = await supabase.from("invitations").select(`id, halqa_id, role, status, halqas ( name )`).eq("email", user.email?.toLowerCase());

      // Implicit Kick System: If the user is an editor but their invitation was deleted by the admin, remove them from halqa_members
      if (inviteData && membersData) {
        for (const m of membersData) {
          if (m.role === 'owner') continue;
          const hId = Array.isArray(m.halqas) ? (m.halqas[0] as any)?.id : (m.halqas as any)?.id;
          const hasInvite = (inviteData as any[]).find(i => i.halqa_id === hId);
          if (!hasInvite) {
            await supabase.from("halqa_members").delete().eq("halqa_id", hId).eq("user_id", user.id);
            finalHalqas = finalHalqas.filter(h => h.id !== hId);
          }
        }
      }

      setHalqas(finalHalqas);

      if (inviteData) {
        const formattedInvites = (inviteData as any[]).map(i => ({
          ...i,
          halqas: Array.isArray(i.halqas) ? i.halqas[0] : i.halqas
        })) as Invitation[];
        setInvitations(formattedInvites.filter(i => i.status === 'pending'));
        setArchivedInvites(formattedInvites.filter(i => i.status !== 'pending'));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAcceptInvite = async (invite: Invitation) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("halqa_members").insert([{ halqa_id: invite.halqa_id, user_id: user?.id, role: invite.role }]);
      if (error && error.code !== '23505') throw error;
      await supabase.from("invitations").update({ status: 'accepted' }).eq("id", invite.id);
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const handleRejectInvite = async (invite: Invitation) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Delete the invitation entirely to prevent access
      const { error } = await supabase.from("invitations").delete().eq("id", invite.id);
      if (error) throw error;
      // Also remove from halqa_members if they somehow got added
      if (user) {
        await supabase.from("halqa_members").delete().eq("halqa_id", invite.halqa_id).eq("user_id", user.id);
      }
      // Immediately remove from local UI state
      setInvitations(prev => prev.filter(i => i.id !== invite.id));
    } catch (err: any) {
      // If delete fails due to RLS, fall back to updating status
      try {
        await supabase.from("invitations").update({ status: 'rejected' }).eq("id", invite.id);
        setInvitations(prev => prev.filter(i => i.id !== invite.id));
        setArchivedInvites(prev => [...prev, { ...invite, status: 'rejected' }]);
      } catch (e2: any) { alert("تعذّر رفض الدعوة: " + e2.message); }
    }
  };

  const createHalqa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHalqaName.trim()) return;
    try {
      setIsSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("halqas").insert([{ name: newHalqaName, created_by: user?.id }]);
      if (error) throw error;
      setNewHalqaName("");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) { alert(err.message); }
    finally { setIsSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-10" dir="rtl">
      {/* Mobile-Optimized Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-4 py-4 md:px-8">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-slate-800">مرحباً بك 👋</h1>
            <p className="text-[10px] font-bold text-slate-400">إليك حلقاتك التعليمية اليوم</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsModalOpen(true)} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"><Plus size={20} /></button>
            <button onClick={() => router.push("/profile")} className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:text-blue-500 transition-all"><User size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8 space-y-8">
        {/* Invitations - Banner Style on Mobile */}
        {invitations.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">دعوات بانتظارك</h2>
            {invitations.map((invite) => (
              <div key={invite.id} className="bg-gradient-to-r from-blue-600 to-blue-500 p-5 rounded-[28px] text-white flex items-center justify-between shadow-xl shadow-blue-100">
                <div className="flex-1">
                  <h3 className="font-black text-lg leading-tight">{invite.halqas?.name}</h3>
                  <p className="text-blue-100 text-[10px] font-bold">دعوة من معلم آخر</p>
                </div>
                <div className="flex gap-2 mr-4">
                  <button onClick={() => handleAcceptInvite(invite)} className="w-10 h-10 bg-white text-blue-600 rounded-xl flex items-center justify-center shadow-sm"><Check size={20} /></button>
                  <button onClick={() => handleRejectInvite(invite)} className="w-10 h-10 bg-blue-400/50 text-white rounded-xl flex items-center justify-center"><X size={20} /></button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Halqas List - List Style on Mobile */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">حلقاتي</h2>
            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{halqas.length} حلقات</span>
          </div>

          {halqas.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-[32px] border-2 border-dashed border-slate-100 px-6">
              <LayoutGrid size={48} className="mx-auto text-slate-100 mb-4" />
              <p className="text-slate-400 text-sm font-bold">لا يوجد حلقات حالياً. ابدأ بإنشاء حلقتك الأولى!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {halqas.map((halqa) => (
                <div
                  key={halqa.id}
                  onClick={() => router.push(`/halqa/${halqa.id}`)}
                  className="bg-white p-4 rounded-[28px] border border-slate-100 hover:border-blue-500 transition-all flex items-center gap-4 cursor-pointer group shadow-sm active:scale-95"
                >
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all", halqa.role === 'owner' ? "bg-amber-50 text-amber-500" : "bg-blue-50 text-blue-500")}>
                    <Users size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-800 text-base">{halqa.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400">{halqa.role === 'owner' ? 'المالك' : 'معلم (محرر)'}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 ml-2 group-hover:text-blue-500 group-hover:translate-x-[-4px] transition-all rotate-180" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Archived - Minimal Style */}
        {archivedInvites.length > 0 && (
          <section className="pt-4">
            <button onClick={() => setShowArchive(!showArchive)} className="w-full flex items-center justify-center gap-2 py-4 bg-slate-50 rounded-2xl text-slate-400 font-bold text-xs hover:text-slate-600 transition-all">
              <History size={16} /> {showArchive ? "إخفاء الأرشيف" : "عرض أرشيف الدعوات"}
            </button>
            {showArchive && (
              <div className="mt-4 space-y-2 animate-in fade-in zoom-in-95">
                {archivedInvites.map((invite) => (
                  <div key={invite.id} className="bg-white/50 p-4 rounded-2xl border border-slate-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-500">{invite.halqas?.name}</span>
                    <span className={cn("text-[8px] font-black px-2 py-0.5 rounded-full", invite.status === 'accepted' ? "bg-green-50 text-green-500" : "bg-red-50 text-red-500")}>{invite.status === 'accepted' ? "مقبولة" : "مرفوضة"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Create Modal - Responsive */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] md:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-300">
            <div className="bg-blue-600 p-8 text-white text-center">
              <h3 className="text-2xl font-black">حلقة جديدة</h3>
              <p className="text-blue-100 text-xs mt-1">قم بتسمية حلقتك التعليمية</p>
            </div>
            <form onSubmit={createHalqa} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">اسم الحلقة</label>
                <input autoFocus required type="text" value={newHalqaName} onChange={e => setNewHalqaName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="مثال: حلقة الإبداع" />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2">{isSubmitting && <Loader2 size={18} className="animate-spin" />} إنشاء</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-500 font-black py-4 rounded-2xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
