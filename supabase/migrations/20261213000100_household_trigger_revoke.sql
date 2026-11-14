-- Security hardening only: no behaviour change.
-- `app.household_after_member_delete()` is a SECURITY DEFINER trigger function. Postgres grants EXECUTE on every new function to PUBLIC by default,
-- which no caller needs: a trigger function cannot be called directly in SQL, and trigger firing does not check the executing role's EXECUTE
-- privilege (it is checked once, when the trigger is created). The owner keeps access, and the trigger `household_members_after_delete` is untouched.
revoke execute on function app.household_after_member_delete() from public;
