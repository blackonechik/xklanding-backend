create table if not exists bank_cards (
  id uuid primary key default gen_random_uuid(),
  owner_nickname varchar(16) not null,
  owner_lowercase varchar(16) not null,
  title varchar(40) not null,
  card_number varchar(19) not null unique,
  balance_diamonds integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now()
);

create index if not exists bank_cards_owner_lowercase_idx on bank_cards(owner_lowercase);

create table if not exists bank_transfers (
  id uuid primary key default gen_random_uuid(),
  from_card_id uuid not null references bank_cards(id) on delete restrict,
  to_card_id uuid not null references bank_cards(id) on delete restrict,
  from_owner varchar(16) not null,
  to_owner varchar(16) not null,
  amount_diamonds integer not null,
  comment varchar(120),
  created_at timestamptz(6) not null default now()
);

create index if not exists bank_transfers_from_card_id_idx on bank_transfers(from_card_id);
create index if not exists bank_transfers_to_card_id_idx on bank_transfers(to_card_id);
