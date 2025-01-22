/*
  # Fix profiles table policies

  1. Changes
    - Add policy for inserting profiles during signup
    - Update existing policies for better security

  2. Security
    - Enable inserting profiles for authenticated users
    - Maintain read access for authenticated users
    - Restrict updates to own profile
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create new policies
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);