// Edge Function `ai`: the AI gateway for the Coach (chat and weekly review). It serves nothing until the owner sets AI_PROVIDER=mock (see docs/TESTFLIGHT_RELEASE_READINESS.md).
// All the decisions (kill switches, safety screen, consent, monthly allowance, budget) are in the tested gateway; this file only connects it to the project it runs in.
//   Secrets/variables:  AI_PROVIDER  must be exactly `mock` (a live provider is not implemented, so `live` is refused)
//                       AI_ROUTES    optional, `coach` (default) or `coach,photo`; leave unset: photo analysis would be a simulated analysis of a real photo
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are supplied by the platform for the project the function is deployed to, so it can never talk to another one.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  buildServerDeps,
  createAiEdgeHandler,
  notConfigured,
  resolveAiEdgeConfig,
} from '../_shared/generated/ai-gateway.ts';

const config = resolveAiEdgeConfig({
  AI_PROVIDER: Deno.env.get('AI_PROVIDER'),
  AI_ROUTES: Deno.env.get('AI_ROUTES'),
});
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const handler = config.ok ? createAiEdgeHandler(buildServerDeps(admin), config.config) : null;

Deno.serve((req) => (handler ? handler(req) : Promise.resolve(notConfigured())));
