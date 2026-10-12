-- Public catalog images; no direct administrative table access.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('vehicle-images','vehicle-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive guard also blocks unrelated broad authenticated policies for this bucket.
-- The backend uses its secret key; scoped signed uploads are issued only after ADMIN auth.
CREATE POLICY vehicle_images_backend_only ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated USING(bucket_id <> 'vehicle-images') WITH CHECK(bucket_id <> 'vehicle-images');
