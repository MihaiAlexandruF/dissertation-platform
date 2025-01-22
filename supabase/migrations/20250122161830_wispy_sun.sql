/*
  # Add storage bucket for dissertation files

  1. Storage
    - Create 'dissertation-files' bucket for storing student and professor files
    - Set up RLS policies for secure file access
    
  2. Security
    - Enable RLS on storage.objects
    - Add policies for file upload and access
*/

-- Create bucket for file storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('dissertation-files', 'dissertation-files', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the storage bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create storage policies
CREATE POLICY "Users can upload their own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dissertation-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'dissertation-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read files they have access to"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dissertation-files' AND
    EXISTS (
      SELECT 1 FROM coordination_requests
      WHERE (student_id = auth.uid() OR professor_id = auth.uid()) AND
      (storage.foldername(name))[2] = id::text
    )
  );

CREATE POLICY "Users can delete their own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dissertation-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );