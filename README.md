# Leaf Doctor Bangla

Build a web app called "LeafDoc – পাতা ডাক্তার" for detecting plant leaf diseases from photos.

The UI language must be Bengali (বাংলা) with English disease names in brackets. Use a clean, green agricultural theme, mobile-first design (farmers will use phones).

Use Supabase for database, storage and auth.

Database tables:

1. crop_profiles: id, name_bn (e.g. "আম পাতা"), name_en ("Mango Leaf"), description, cover_image_url, is_active, created_at

2. disease_classes: id, crop_profile_id (FK), name_bn, name_en, is_healthy (boolean), symptoms_bn (text), treatment_bn (text), prevention_bn (text), color_hex, sort_order

3. reference_images: id, disease_class_id (FK), image_url, embedding (float8[] or jsonb, nullable), created_at

4. diagnoses: id, user_id (nullable), crop_profile_id, image_url, predicted_class_id, confidence (float), top3 (jsonb), created_at

Supabase storage buckets: "reference-images" and "diagnosis-images".

Seed data: one crop profile "আম পাতা (Mango Leaf)" with 6 classes:

- সুস্থ পাতা (Healthy) — is_healthy = true

- অ্যানথ্রাকনোজ (Anthracnose)

- পাউডারি মিলডিউ (Powdery Mildew)

- শুটি মোল্ড (Sooty Mould)

- ব্যাকটেরিয়াল ক্যাংকার (Bacterial Canker)

- ডাই ব্যাক (Die Back)

Fill symptoms_bn, treatment_bn, prevention_bn with short, practical Bengali text for each.

Pages:

- "/" Home: choose crop profile (cards), big button "পাতার ছবি তুলুন / আপলোড করুন"

- "/diagnose/:cropId": diagnosis page (build in later step, placeholder for now)

- "/admin": admin panel (login required)

- "/history": past diagnoses

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://leaf-dacter.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6103c48b-3292-4911-8639-301e8ab3c058).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
