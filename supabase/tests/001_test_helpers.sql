-- Native PL/pgSQL assertion helpers for the disposable test database only.
-- Not part of the production migration; never applied outside supabase/tests/.
--
-- Every helper RAISEs on failure. Combined with `psql -v ON_ERROR_STOP=1`,
-- a single failed assertion aborts the current file immediately and the
-- runner's process substitution surfaces a nonzero exit code — there is no
-- step where a human has to read a transcript to know whether something
-- passed.

create schema if not exists test;

-- Fails unless `condition` is true.
create function test.assert_true(name text, condition boolean, detail text default null)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'TEST FAILED: % — %', name, coalesce(detail, 'condition was not true');
  end if;
  raise notice 'TEST OK: %', name;
end;
$$;

-- Fails unless `actual` equals `expected` (null-safe via IS [NOT] DISTINCT FROM).
create function test.assert_equals(name text, actual anyelement, expected anyelement)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'TEST FAILED: % — expected % but got %', name, expected, actual;
  end if;
  raise notice 'TEST OK: % (%)', name, actual;
end;
$$;

-- Runs `stmt` as dynamic SQL inside its own subtransaction. Fails the test
-- if `stmt` succeeds. If `expected_sqlstate` is given, also fails the test
-- if `stmt` failed with a *different* SQLSTATE than expected, so a denial
-- test cannot accidentally pass because of an unrelated error.
create function test.assert_fails(name text, stmt text, expected_sqlstate text default null)
returns void
language plpgsql
as $$
declare
  stmt_failed boolean := false;
  got_sqlstate text;
  got_message text;
begin
  begin
    execute stmt;
  exception
    when others then
      stmt_failed := true;
      get stacked diagnostics got_sqlstate = returned_sqlstate;
      got_message := sqlerrm;
  end;

  if not stmt_failed then
    raise exception 'TEST FAILED: % — statement unexpectedly succeeded: %', name, stmt;
  end if;

  if expected_sqlstate is not null and got_sqlstate is distinct from expected_sqlstate then
    raise exception 'TEST FAILED: % — expected SQLSTATE % but statement failed with % (%): %',
      name, expected_sqlstate, got_sqlstate, got_message, stmt;
  end if;

  raise notice 'TEST OK: % (failed as expected: % — %)', name, got_sqlstate, got_message;
end;
$$;

-- Deliberately left executable by anon/authenticated/service_role: test files
-- call these helpers *while impersonating those roles* (`set role anon;` and
-- so on) to assert what each role can and cannot do. This schema only ever
-- exists in the disposable database created by run.sh — it is never part of
-- the production migration and never reachable from a real project.
grant usage on schema test to anon, authenticated, service_role;
grant execute on function test.assert_true(text, boolean, text) to anon, authenticated, service_role;
grant execute on function test.assert_equals(text, anyelement, anyelement) to anon, authenticated, service_role;
grant execute on function test.assert_fails(text, text, text) to anon, authenticated, service_role;
