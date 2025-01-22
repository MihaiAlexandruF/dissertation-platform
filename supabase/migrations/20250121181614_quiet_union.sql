/*
  # Add file management and request handling

  1. Changes
    - Add trigger to prevent multiple active requests per student
    - Add function to handle request status changes
    - Add policies for file uploads

  2. Security
    - Ensure students can't have multiple active requests
    - Allow file uploads only for approved requests
    - Restrict file updates to appropriate users
*/

-- Function to check for active requests
CREATE OR REPLACE FUNCTION check_active_requests()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1 FROM coordination_requests
    WHERE student_id = NEW.student_id
    AND status IN ('pending', 'approved')
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Student already has an active request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for checking active requests
CREATE TRIGGER check_active_requests_trigger
  BEFORE INSERT OR UPDATE ON coordination_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_active_requests();

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students can upload files to approved requests" ON coordination_requests;
DROP POLICY IF EXISTS "Professors can manage request status" ON coordination_requests;

-- Create separate policies for different actions
CREATE POLICY "Students can view their requests"
  ON coordination_requests FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Professors can view their requests"
  ON coordination_requests FOR SELECT
  TO authenticated
  USING (professor_id = auth.uid());

CREATE POLICY "Students can upload their files"
  ON coordination_requests FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid() AND
    status = 'approved'
  )
  WITH CHECK (
    student_id = auth.uid() AND
    status = 'approved' AND
    professor_file_url IS NOT NULL
  );

CREATE POLICY "Professors can upload their files"
  ON coordination_requests FOR UPDATE
  TO authenticated
  USING (
    professor_id = auth.uid() AND
    status = 'approved'
  )
  WITH CHECK (
    professor_id = auth.uid() AND
    status = 'approved' AND
    student_file_url IS NOT NULL
  );

CREATE POLICY "Professors can approve requests"
  ON coordination_requests FOR UPDATE
  TO authenticated
  USING (
    professor_id = auth.uid() AND
    status = 'pending'
  )
  WITH CHECK (
    professor_id = auth.uid() AND
    status = 'approved' AND
    rejection_reason IS NULL
  );

CREATE POLICY "Professors can reject requests"
  ON coordination_requests FOR UPDATE
  TO authenticated
  USING (
    professor_id = auth.uid() AND
    status = 'pending'
  )
  WITH CHECK (
    professor_id = auth.uid() AND
    status = 'rejected' AND
    rejection_reason IS NOT NULL
  );

-- Create bucket for file storage if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('dissertation-files', 'dissertation-files')
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

CREATE POLICY "Users can read files they have access to"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dissertation-files' AND
    EXISTS (
      SELECT 1 FROM coordination_requests
      WHERE (student_id = auth.uid() OR professor_id = auth.uid()) AND
      (
        storage.foldername(name))[2] = id::text
    )
  );