-- 1. Profiles Table (Linked to Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Halqas (Workspaces) Table
CREATE TABLE halqas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users NOT NULL,
  settings JSONB DEFAULT '{
    "absence_threshold": 3,
    "weekend_days": [5, 6],
    "manual_holidays": []
  }'::jsonb
);

-- 3. Halqa Members (Roles & Permissions)
CREATE TYPE halqa_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE halqa_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  halqa_id UUID REFERENCES halqas ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role halqa_role NOT NULL DEFAULT 'viewer',
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(halqa_id, user_id)
);

-- 4. Students Table
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  halqa_id UUID REFERENCES halqas ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  parent_phone TEXT,
  notes TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Attendance Table
CREATE TABLE attendance (
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

-- --- Row Level Security (RLS) ---

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE halqas ENABLE ROW LEVEL SECURITY;
ALTER TABLE halqa_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view all profiles, but only edit their own
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Halqas: Users can see halqas they are members of
CREATE POLICY "Users can view halqas they belong to" ON halqas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = halqas.id 
      AND halqa_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create halqas" ON halqas
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update their halqas" ON halqas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = halqas.id 
      AND halqa_members.user_id = auth.uid() 
      AND halqa_members.role = 'owner'
    )
  );

-- Halqa Members: Visibility and Management
CREATE POLICY "Members can view other members in the same halqa" ON halqa_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM halqa_members AS current_member
      WHERE current_member.halqa_id = halqa_members.halqa_id 
      AND current_member.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage members" ON halqa_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM halqa_members AS current_member
      WHERE current_member.halqa_id = halqa_members.halqa_id 
      AND current_member.user_id = auth.uid() 
      AND current_member.role = 'owner'
    )
  );

-- Students: Accessible by any member of the halqa
CREATE POLICY "Members can view students" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = students.halqa_id 
      AND halqa_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Editors and Owners can manage students" ON students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = students.halqa_id 
      AND halqa_members.user_id = auth.uid() 
      AND halqa_members.role IN ('owner', 'editor')
    )
  );

-- Attendance: Accessible by any member of the halqa
CREATE POLICY "Members can view attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = attendance.halqa_id 
      AND halqa_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Editors and Owners can record attendance" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM halqa_members 
      WHERE halqa_members.halqa_id = attendance.halqa_id 
      AND halqa_members.user_id = auth.uid() 
      AND halqa_members.role IN ('owner', 'editor')
    )
  );

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger for halqa creator becoming owner
CREATE OR REPLACE FUNCTION public.handle_new_halqa()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.halqa_members (halqa_id, user_id, role)
  VALUES (new.id, new.created_by, 'owner');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_halqa_created
  AFTER INSERT ON public.halqas
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_halqa();
