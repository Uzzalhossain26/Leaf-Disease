CREATE TABLE public.diagnosis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid,
  crop_profile_id uuid NOT NULL REFERENCES public.crop_profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  predicted_class_id uuid REFERENCES public.disease_classes(id) ON DELETE SET NULL,
  suggested_class_id uuid NOT NULL REFERENCES public.disease_classes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.diagnosis_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnosis_reports TO authenticated;
GRANT ALL ON public.diagnosis_reports TO service_role;
ALTER TABLE public.diagnosis_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone report" ON public.diagnosis_reports FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "admin manage reports" ON public.diagnosis_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));