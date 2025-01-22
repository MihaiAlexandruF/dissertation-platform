/*
  # Initial Schema for Dissertation Registration System

  1. New Tables
    - `profiles`
      - Stores user profile information
      - Links to Supabase auth.users
      - Contains user type (student/professor)
    - `registration_sessions`
      - Stores professor's registration sessions
      - Contains start and end times
      - Links to professor's profile
    - `coordination_requests`
      - Stores student requests for dissertation coordination
      - Links to student, professor, and session
      - Tracks request status and files
    - `coordination_limits`
      - Stores professor's coordination limits
      - Contains academic year and max students

  2. Security
    - Enable RLS on all tables
    - Policies for reading and writing based on user role
*/

-- Create profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text NOT NULL,
  user_type text NOT NULL CHECK (user_type IN ('student', 'professor')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create registration sessions table
CREATE TABLE registration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid REFERENCES profiles(id) NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  academic_year text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_overlap CHECK (start_time < end_time)
);

-- Create coordination requests table
CREATE TABLE coordination_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES profiles(id) NOT NULL,
  professor_id uuid REFERENCES profiles(id) NOT NULL,
  session_id uuid REFERENCES registration_sessions(id) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  student_file_url text,
  professor_file_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create coordination limits table
CREATE TABLE coordination_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid REFERENCES profiles(id) NOT NULL,
  academic_year text NOT NULL,
  max_students integer NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  UNIQUE (professor_id, academic_year)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordination_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordination_limits ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Registration sessions policies
CREATE POLICY "Anyone can read registration sessions"
  ON registration_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Professors can create their own sessions"
  ON registration_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    professor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'professor'
    )
  );

-- Coordination requests policies
CREATE POLICY "Users can read their own requests"
  ON coordination_requests FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR
    professor_id = auth.uid()
  );

CREATE POLICY "Students can create requests"
  ON coordination_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'student'
    )
  );

CREATE POLICY "Involved users can update requests"
  ON coordination_requests FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid() OR
    professor_id = auth.uid()
  );

-- Coordination limits policies
CREATE POLICY "Anyone can read coordination limits"
  ON coordination_limits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Professors can manage their limits"
  ON coordination_limits FOR ALL
  TO authenticated
  USING (
    professor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'professor'
    )
  );

-- Create functions
CREATE OR REPLACE FUNCTION check_professor_availability(professor_id uuid, academic_year text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count integer;
  max_students integer;
BEGIN
  -- Get the current number of approved students
  SELECT COUNT(*)
  INTO current_count
  FROM coordination_requests
  WHERE professor_id = professor_id
    AND status = 'approved'
    AND created_at >= (academic_year || '-09-01')::date
    AND created_at < ((academic_year::integer + 1)::text || '-09-01')::date;

  -- Get the professor's limit
  SELECT COALESCE(max_students, 10)
  INTO max_students
  FROM coordination_limits
  WHERE professor_id = professor_id
    AND academic_year = academic_year;

  RETURN current_count < max_students;
END;
$$;