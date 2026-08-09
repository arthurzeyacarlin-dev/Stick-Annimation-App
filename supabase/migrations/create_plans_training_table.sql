create table if not exists public.generate_plans_training_examples (
  id text primary key,
  mode text not null,
  category text not null,
  user_prompt text not null,
  story text not null,
  known_facts jsonb not null default '[]'::jsonb,
  missing_facts jsonb not null default '[]'::jsonb,
  ranked_missing_facts jsonb not null default '[]'::jsonb,
  strongest_gap text,
  best_question text,
  acceptable_options jsonb not null default '[]'::jsonb,
  bad_questions jsonb not null default '[]'::jsonb,
  reasoning text not null,
  should_plan_now boolean not null default false,
  should_ask_question boolean not null default false,
  story_help_mode text not null default 'none',
  enough_known_to_plan boolean not null default false,
  max_questions_before_planning integer not null default 3,
  bad_style_notes jsonb not null default '[]'::jsonb,
  story_quality_notes jsonb not null default '[]'::jsonb,
  plan_quality_notes jsonb not null default '[]'::jsonb,
  story_structure jsonb not null default '{}'::jsonb,
  story_options jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists generate_plans_training_examples_mode_idx
  on public.generate_plans_training_examples (mode, is_active);

alter table if exists public.generate_plans_training_examples
  add column if not exists enough_known_to_plan boolean not null default false;

alter table if exists public.generate_plans_training_examples
  add column if not exists max_questions_before_planning integer not null default 3;

alter table if exists public.generate_plans_training_examples
  add column if not exists bad_style_notes jsonb not null default '[]'::jsonb;

alter table if exists public.generate_plans_training_examples
  add column if not exists story_quality_notes jsonb not null default '[]'::jsonb;

alter table if exists public.generate_plans_training_examples
  add column if not exists plan_quality_notes jsonb not null default '[]'::jsonb;

alter table if exists public.generate_plans_training_examples
  add column if not exists story_structure jsonb not null default '{}'::jsonb;

alter table if exists public.generate_plans_training_examples
  add column if not exists story_options jsonb not null default '[]'::jsonb;
