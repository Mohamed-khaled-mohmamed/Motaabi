-- ==========================================
-- SETUP_SUPABASE.sql
-- انسخ هذا الملف بالكامل والصقه في Supabase SQL Editor واضغط Run
-- ==========================================

-- 1. تنظيف أي سياسات قديمة لتجنب التعارض
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view halqas they belong to" ON halqas;
DROP POLICY IF EXISTS "Users can create halqas" ON halqas;
DROP POLICY IF EXISTS "Members can view other members in the same halqa" ON halqa_members;
DROP POLICY IF EXISTS "Owners can manage members" ON halqa_members;
DROP POLICY IF EXISTS "Members can view students" ON students;
DROP POLICY IF EXISTS "Editors can manage students" ON students;
DROP POLICY IF EXISTS "Members can view attendance" ON attendance;
DROP POLICY IF EXISTS "Editors can record attendance" ON attendance;

-- 2. إنشاء الجداول (إذا لم تكن موجودة)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS halqas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users NOT NULL,
  settings JSONB DEFAULT '{"absence_threshold": 3, "weekend_days": [5, 6]}'::jsonb
);

DO $$ BEGIN
    CREATE TYPE halqa_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS halqa_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  halqa_id UUID REFERENCES halqas ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role halqa_role NOT NULL DEFAULT 'viewer',
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(halqa_id, user_id)
);

CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  halqa_id UUID REFERENCES halqas ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  parent_phone TEXT,
  notes TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students ON DELETE CASCADE NOT NULL,
  halqa_id UUID REFERENCES halqas ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('present', 'absent', 'excused')) NOT NULL,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(student_id, date)
);

-- 3. تفعيل الحماية RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE halqas ENABLE ROW LEVEL SECURITY;
ALTER TABLE halqa_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- 4. وظائف الحماية (Security Definer لتجنب التكرار اللانهائي)
CREATE OR REPLACE FUNCTION public.check_membership(target_halqa_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.halqa_members 
    WHERE halqa_id = target_halqa_id 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_halqa_owner(target_halqa_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.halqa_members 
    WHERE halqa_id = target_halqa_id 
    AND user_id = auth.uid() 
    AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_halqa_editor(target_halqa_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.halqa_members 
    WHERE halqa_id = target_halqa_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'editor')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. تطبيق السياسات الجديدة باستخدام الوظائف الآمنة
CREATE POLICY "Profiles visibility" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles update" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Halqas access" ON halqas FOR SELECT USING (public.check_membership(id));
CREATE POLICY "Halqas creation" ON halqas FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Members access" ON halqa_members FOR SELECT USING (public.check_membership(halqa_id));
CREATE POLICY "Members management" ON halqa_members FOR ALL USING (public.is_halqa_owner(halqa_id));

CREATE POLICY "Students access" ON students FOR SELECT USING (public.check_membership(halqa_id));
CREATE POLICY "Students management" ON students FOR ALL USING (public.is_halqa_editor(halqa_id));

CREATE POLICY "Attendance access" ON attendance FOR SELECT USING (public.check_membership(halqa_id));
CREATE POLICY "Attendance management" ON attendance FOR ALL USING (public.is_halqa_editor(halqa_id));

-- 6. التلقائيات (Triggers)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_halqa() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.halqa_members (halqa_id, user_id, role)
  VALUES (new.id, new.created_by, 'owner');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_halqa_created ON public.halqas;
CREATE TRIGGER on_halqa_created AFTER INSERT ON public.halqas
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_halqa();
