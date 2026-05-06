"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineActions();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial sync check
    if (navigator.onLine) {
      syncOfflineActions();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncOfflineActions = async () => {
    const actions = await db.syncQueue.toArray();
    if (actions.length === 0) return;

    setIsSyncing(true);
    console.log(`Syncing ${actions.length} offline actions...`);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSyncing(false);
      return;
    }

    for (const action of actions) {
      try {
        if (action.type === 'UPDATE_ATTENDANCE') {
          const { error } = await supabase
            .from("attendance")
            .upsert({
              ...action.payload,
              recorded_by: user.id
            }, { onConflict: 'student_id, date' });

          if (!error) {
            await db.syncQueue.delete(action.id!);
          }
        }
      } catch (err) {
        console.error("Failed to sync action:", action, err);
      }
    }

    setIsSyncing(false);
  };

  const queueAction = async (type: 'UPDATE_ATTENDANCE', payload: any) => {
    // 1. Update local DB immediately for instant UI feedback
    if (type === 'UPDATE_ATTENDANCE') {
      await db.attendance.put({
        student_id: payload.student_id,
        halqa_id: payload.halqa_id,
        date: payload.date,
        status: payload.status
      });
    }

    // 2. If online, try to sync with Supabase
    if (navigator.onLine) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("attendance")
        .upsert({
          ...payload,
          recorded_by: user?.id
        }, { onConflict: 'student_id, date' });

      if (!error) return; // Success, no need to queue
    }

    // 3. If offline or Supabase fails, add to queue
    await db.syncQueue.add({
      type,
      payload,
      timestamp: Date.now()
    });
  };

  return { isOnline, isSyncing, queueAction };
}
