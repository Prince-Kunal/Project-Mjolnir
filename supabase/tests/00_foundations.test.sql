begin;
select plan(7);

select has_extension('citext', 'citext is installed');
select has_extension('pg_cron', 'pg_cron is installed');
select has_extension('pg_net', 'pg_net is installed');
select has_extension('pgmq', 'pgmq is installed');

select has_schema('private', 'private schema exists');
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select * from finish();
rollback;
