alter table bank_cards
  add column if not exists design varchar(32) not null default 'creeper';
