create type public.app_role as enum ('admin','user');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade not null, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.crop_profiles (id uuid primary key default gen_random_uuid(), name_bn text not null, name_en text not null, description text, cover_image_url text, is_active boolean not null default true, created_at timestamptz not null default now());
create table public.disease_classes (id uuid primary key default gen_random_uuid(), crop_profile_id uuid not null references public.crop_profiles(id) on delete cascade, name_bn text not null, name_en text not null, is_healthy boolean not null default false, symptoms_bn text, treatment_bn text, prevention_bn text, color_hex text default '#16a34a', sort_order int not null default 0);
create table public.reference_images (id uuid primary key default gen_random_uuid(), disease_class_id uuid not null references public.disease_classes(id) on delete cascade, image_url text not null, embedding jsonb, created_at timestamptz not null default now());
create table public.diagnoses (id uuid primary key default gen_random_uuid(), user_id uuid, crop_profile_id uuid references public.crop_profiles(id) on delete set null, image_url text, predicted_class_id uuid references public.disease_classes(id) on delete set null, confidence float8, top3 jsonb, created_at timestamptz not null default now());

grant select on public.crop_profiles, public.disease_classes, public.reference_images to anon, authenticated;
grant insert, update, delete on public.crop_profiles, public.disease_classes, public.reference_images to authenticated;
grant select, insert on public.diagnoses to anon, authenticated;
grant delete on public.diagnoses to authenticated;
grant all on public.crop_profiles, public.disease_classes, public.reference_images, public.diagnoses to service_role;

alter table public.crop_profiles enable row level security;
alter table public.disease_classes enable row level security;
alter table public.reference_images enable row level security;
alter table public.diagnoses enable row level security;

create policy "public read crops" on public.crop_profiles for select using (is_active or public.has_role(auth.uid(),'admin'));
create policy "admin write crops" on public.crop_profiles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read classes" on public.disease_classes for select using (true);
create policy "admin write classes" on public.disease_classes for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read refs" on public.reference_images for select using (true);
create policy "admin write refs" on public.reference_images for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "insert diagnosis" on public.diagnoses for insert with check (user_id is null or user_id = auth.uid());
create policy "read own diagnoses" on public.diagnoses for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "delete own diagnoses" on public.diagnoses for delete to authenticated using (user_id = auth.uid());

create policy "public read leaf images" on storage.objects for select using (bucket_id in ('reference-images','diagnosis-images'));
create policy "admin upload refs" on storage.objects for insert to authenticated with check (bucket_id='reference-images' and public.has_role(auth.uid(),'admin'));
create policy "admin delete refs" on storage.objects for delete to authenticated using (bucket_id='reference-images' and public.has_role(auth.uid(),'admin'));
create policy "anyone upload diagnosis" on storage.objects for insert with check (bucket_id='diagnosis-images');

-- first signed-up user becomes admin
create or replace function public.handle_first_admin() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_first_admin after insert on auth.users for each row execute function public.handle_first_admin();

with c as (insert into public.crop_profiles(name_bn,name_en,description) values ('আম পাতা','Mango Leaf','আম গাছের পাতার সাধারণ রোগ শনাক্তকরণ') returning id)
insert into public.disease_classes(crop_profile_id,name_bn,name_en,is_healthy,symptoms_bn,treatment_bn,prevention_bn,color_hex,sort_order)
select c.id, v.* from c, (values
('সুস্থ পাতা','Healthy',true,'পাতা উজ্জ্বল সবুজ, কোনো দাগ বা বিবর্ণতা নেই।','কোনো চিকিৎসার প্রয়োজন নেই।','নিয়মিত সেচ, সুষম সার ও বাগান পরিষ্কার রাখুন।','#16a34a',1),
('অ্যানথ্রাকনোজ','Anthracnose',false,'পাতায় কালো বা বাদামি অনিয়মিত দাগ, দাগের চারপাশ শুকিয়ে যায়, পাতা ঝরে পড়ে।','আক্রান্ত পাতা ও ডাল কেটে পুড়িয়ে ফেলুন। কার্বেন্ডাজিম (১ গ্রাম/লিটার) বা ম্যানকোজেব (২ গ্রাম/লিটার) ১০–১৫ দিন পরপর স্প্রে করুন।','মুকুল আসার আগে ছত্রাকনাশক স্প্রে করুন, গাছের নিচে ঝরা পাতা পরিষ্কার রাখুন।','#7c2d12',2),
('পাউডারি মিলডিউ','Powdery Mildew',false,'পাতা ও মুকুলে সাদা পাউডারের মতো আস্তরণ, পাতা কুঁকড়ে যায়।','সালফার জাতীয় ছত্রাকনাশক (থিওভিট ২ গ্রাম/লিটার) বা হেক্সাকোনাজল (১ মিলি/লিটার) স্প্রে করুন।','মুকুল আসার সময় আগাম স্প্রে করুন, গাছে আলো-বাতাস চলাচল নিশ্চিত করুন।','#a1a1aa',3),
('শুটি মোল্ড','Sooty Mould',false,'পাতার উপরে কালো ঝুলের মতো আস্তরণ, যা ঘষলে উঠে যায়।','শোষক পোকা (হপার, মিলিবাগ) দমনে ইমিডাক্লোপ্রিড (০.৫ মিলি/লিটার) স্প্রে করুন। পরে মাড়ের দ্রবণ (৫০ গ্রাম/লিটার) দিয়ে পাতা ধুয়ে দিন।','হপার ও শোষক পোকা নিয়মিত পর্যবেক্ষণ ও দমন করুন।','#1c1917',4),
('ব্যাকটেরিয়াল ক্যাংকার','Bacterial Canker',false,'পাতায় ছোট পানিভেজা দাগ যা পরে কালো ও উঁচু হয়, দাগের চারপাশে হলুদ বলয়।','আক্রান্ত অংশ কেটে ফেলুন। কপার অক্সিক্লোরাইড (৩ গ্রাম/লিটার) বা স্ট্রেপ্টোসাইক্লিন (০.৫ গ্রাম/১০ লিটার) স্প্রে করুন।','রোগমুক্ত চারা ব্যবহার করুন, ঝড়-বৃষ্টির পর কপারজাতীয় স্প্রে দিন।','#ca8a04',5),
('ডাই ব্যাক','Die Back',false,'ডালের আগা থেকে পাতা বাদামি হয়ে শুকিয়ে নিচের দিকে নামে, পাতা ঝরে যায়।','শুকনো ডাল সুস্থ অংশসহ ২–৩ ইঞ্চি নিচ থেকে কেটে কাটা স্থানে বোর্দো পেস্ট লাগান। কার্বেন্ডাজিম (১ গ্রাম/লিটার) স্প্রে করুন।','ছাঁটাইয়ের পর কাটা অংশে বোর্দো পেস্ট দিন, গাছে সুষম সার প্রয়োগ করুন।','#92400e',6)
) as v(name_bn,name_en,is_healthy,symptoms_bn,treatment_bn,prevention_bn,color_hex,sort_order);