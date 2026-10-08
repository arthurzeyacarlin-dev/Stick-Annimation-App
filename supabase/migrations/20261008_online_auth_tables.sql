-- Online beta: better-auth 1.7.6 account tables for the "Diamond Animator Live" project.
-- Generated from better-auth's own Postgres migration compiler for this app's auth config
-- (email + password, extra user field "previewPlan"), so the server's schema check matches.
-- Only the server touches these tables (it connects as the database owner via DATABASE_URL),
-- so RLS is on with NO policies and the public API roles get no access at all.

create table public."user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null,
  "previewPlan" text not null
);

create table public."session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references public."user" ("id") on delete cascade
);

create table public."account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references public."user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null
);

create table public."verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

create index "session_userId_idx" on public."session" ("userId");
create index "account_userId_idx" on public."account" ("userId");
create index "verification_identifier_idx" on public."verification" ("identifier");

alter table public."user" enable row level security;
alter table public."session" enable row level security;
alter table public."account" enable row level security;
alter table public."verification" enable row level security;

revoke all on public."user" from public, anon, authenticated;
revoke all on public."session" from public, anon, authenticated;
revoke all on public."account" from public, anon, authenticated;
revoke all on public."verification" from public, anon, authenticated;
