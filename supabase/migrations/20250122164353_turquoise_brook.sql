INSERT INTO storage.buckets (id, name, public)
VALUES ('dissertation-files', 'dissertation-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

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