-- Replay fix: a completed recovery records when its follow-up work was FULLY applied, and an identical replay reports it so the caller does nothing further.
do $$
declare u uuid; r jsonb; txid text := md5('replay-tx'); reqid text := md5('replay-req');
  cmac text := 'c-mac'; dmac text := 'new-digest-mac'; smac text := 'new-secret-mac';
begin
  perform test.as_admin();
  u := test.make_user('replay@example.test');
  -- an account made through the real provisioning functions, so the identifier exists
  perform public.acct_provision_begin(jsonb_build_object('requestId', reqid, 'secretMac', 's', 'now', 1));
  perform public.acct_provision_attach(jsonb_build_object('requestId', reqid, 'userId', u, 'identifier', 'u-replay@accounts.example'));
  perform public.acct_provision_finalize(jsonb_build_object('requestId', reqid, 'userId', u, 'digestMac', 'old-digest-mac', 'q1', 'q-a', 'q2', 'q-b', 'salt', md5('s'), 'proofMac', 'p', 'now', 1));
  -- a verified transaction that is ready to complete
  insert into app.acct_tx (tx_id, user_id, state, completion_mac, ready_at, expires_at) values (txid, u, 'verified', cmac, 100, 1000000);

  -- first completion: not yet applied
  r := public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', cmac, 'newDigestMac', dmac, 'newSecretMac', smac, 'now', 200));
  perform test.assert(r ->> 'result' = 'ok' and (r ->> 'applied')::boolean = false, 'the first completion reports the follow-up work as not yet applied');
  -- an identical replay BEFORE the work is recorded still asks the caller to finish it (the function may have died after this call)
  r := public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', cmac, 'newDigestMac', dmac, 'newSecretMac', smac, 'now', 201));
  perform test.assert(r ->> 'result' = 'ok' and (r ->> 'applied')::boolean = false, 'a replay before the work is recorded asks for it to be completed');
  -- the caller marks the work applied; marking twice changes nothing
  perform public.acct_tx_applied(jsonb_build_object('txId', txid, 'now', 300));
  perform public.acct_tx_applied(jsonb_build_object('txId', txid, 'now', 999));
  perform test.assert((select applied_at from app.acct_tx where tx_id = txid) = 300, 'applied_at is set once and never moved');
  -- now an identical replay is a no-op for the caller, and carries the identifier from the provisioning record
  r := public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', cmac, 'newDigestMac', dmac, 'newSecretMac', smac, 'now', 400));
  perform test.assert(r ->> 'result' = 'ok' and (r ->> 'applied')::boolean = true and r ->> 'identifier' = 'u-replay@accounts.example', 'a fully applied replay reports applied and the identifier');
  -- anything that is not IDENTICAL is refused
  perform test.assert(public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', cmac, 'newDigestMac', dmac, 'newSecretMac', 'other', 'now', 401)) ->> 'result' = 'invalid', 'a different device secret is refused');
  perform test.assert(public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', cmac, 'newDigestMac', 'other', 'newSecretMac', smac, 'now', 402)) ->> 'result' = 'invalid', 'a different new key is refused');
  perform test.assert(public.acct_tx_complete(jsonb_build_object('txId', txid, 'completionMac', 'wrong', 'newDigestMac', dmac, 'newSecretMac', smac, 'now', 403)) ->> 'result' = 'invalid', 'a different completion secret is refused');
  -- a replay never changes the stored key
  perform test.assert((select digest_mac from app.acct_recovery where user_id = u) = dmac, 'the stored key is unchanged by replays');
  -- revert clears the marker, so a rolled-back completion is not mistaken for a finished one
  perform public.acct_tx_revert(jsonb_build_object('txId', txid));
  perform test.assert((select state from app.acct_tx where tx_id = txid) = 'verified' and (select applied_at from app.acct_tx where tx_id = txid) is null, 'revert returns the transaction to verified with no applied marker');
  perform test.assert((select digest_mac from app.acct_recovery where user_id = u) = 'old-digest-mac', 'revert restores the previous key');
  -- marking applies only to finished transactions
  perform public.acct_tx_applied(jsonb_build_object('txId', txid, 'now', 500));
  perform test.assert((select applied_at from app.acct_tx where tx_id = txid) is null, 'a verified transaction cannot be marked applied');

  -- privileges: the new function is service-role only, like every other acct_* function
  perform test.assert(not has_function_privilege('anon', 'public.acct_tx_applied(jsonb)', 'execute'), 'anon cannot execute acct_tx_applied');
  perform test.assert(not has_function_privilege('authenticated', 'public.acct_tx_applied(jsonb)', 'execute'), 'signed-in users cannot execute acct_tx_applied');
  perform test.assert(has_function_privilege('service_role', 'public.acct_tx_applied(jsonb)', 'execute'), 'the service role can execute acct_tx_applied');
  perform test.assert(not has_function_privilege('authenticated', 'public.acct_tx_complete(jsonb)', 'execute'), 'replacing acct_tx_complete kept it locked to the service role');
  perform test.as_user(u);
  perform test.throws($q$select public.acct_tx_applied('{}'::jsonb)$q$, 'permission denied');
  perform test.as_admin();
end $$;
