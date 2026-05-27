-- ============================================================
-- MIGRATION 003: System Settings & Maintenance Mode
-- VibeQuiz — global settings table and policies
-- ============================================================

-- Table to hold global key-value configuration flags
create table if not exists system_settings (
  key        text        primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Trigger to auto-update updated_at on modify
create trigger system_settings_updated_at
  before update on system_settings
  for each row execute function update_updated_at();

-- Enable Row Level Security (RLS)
alter table system_settings enable row level security;

-- Create policy allowing anyone to read system settings (needed for public checking)
create policy "Anyone can read system settings"
  on system_settings for select
  using (true);

-- Note: No policies for insert, update, or delete are created.
-- This ensures that only database admins, postgres, or service_role can modify settings.
-- It is completely secure and cannot be manipulated from standard clients.

-- Seed default maintenance_mode value
insert into system_settings (key, value)
values (
  'maintenance_mode',
  '{"active": false, "message": "VibeQuiz is currently undergoing scheduled database upgrades to support even larger concurrent lobby sizes. We will be back online shortly!", "estimated_end": null}'::jsonb
)
on conflict (key) do nothing;
