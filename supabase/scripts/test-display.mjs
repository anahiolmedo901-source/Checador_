// Smoke test del Smart Display (Fase 3) contra una base real.
//
// Uso (desde la raíz del repo):
//   node --env-file-if-exists=.env supabase/scripts/test-display.mjs [--with-mocks]
//
// 1) Rota/crea un token para TV001 y lo registra (login de pantalla).
// 2) Lee el snapshot del tablero (conteos, últimas checadas, avisos, playlist).
// 3) Con --with-mocks inserta eventos simulados (checada, aviso, playlist)
//    vía la API como service_role para validar agregados y Realtime.
//
// Variables requeridas: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const assertEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno: ${name}`);
    process.exit(1);
  }
  return value;
};

const url = assertEnv('EXPO_PUBLIC_SUPABASE_URL');
const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const withMocks = process.argv.includes('--with-mocks');

async function main() {
  console.log('--- 1. Token para el display TV001 ---');
  const { data: display, error: dispErr } = await supabase
    .from('displays')
    .select('id, code, name, branch_id')
    .eq('code', 'TV001')
    .maybeSingle();
  if (dispErr) throw dispErr;
  if (!display) {
    console.error('No hay display TV001. Corre el seed primero.');
    process.exit(1);
  }

  const { data: rotated, error: rotateErr } = await supabase.rpc('display_token_rotate', {
    p_display_id: display.id,
  });
  if (rotateErr) throw rotateErr;
  console.log('  Token creado (solo lo mostramos para el test):', rotated.token.slice(0, 12) + '…');

  console.log('\n--- 2. Autenticación de la TV (mechanism propio) ---');
  const { data: auth, error: authErr } = await supabase.rpc('display_authenticate', {
    p_code: 'TV001',
    p_token: rotated.token,
  });
  if (authErr) throw authErr;
  console.log('  ok:', auth.ok, '| display:', auth.display?.id, '| branch:', auth.display?.branch_id);
  if (!auth.ok) {
    console.error('  Auth falló:', auth.reason);
    process.exit(1);
  }

  console.log('\n--- 3. Snapshot inicial ---');
  await printSnapshot(display.id);

  if (withMocks) {
    console.log('\n--- 4. Simulación de eventos (valida agregados) ---');
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('code', 'EMP001')
      .maybeSingle();
    if (empErr) throw empErr;

    const { data: att, error: attErr } = await supabase
      .from('attendance')
      .insert({
        session_id: crypto.randomUUID(),
        employee_id: emp.id,
        branch_id: display.branch_id,
        check_type: 'check_in',
        check_date: new Date().toISOString().slice(0, 10),
        happened_at: new Date().toISOString(),
        status: 'on_time',
        source: 'manual',
      })
      .select()
      .single();
    if (attErr) throw attErr;
    console.log('  • Checada insertada:', emp.full_name, '@ check_in');

    const { data: ann, error: annErr } = await supabase
      .from('announcements')
      .insert({ title: 'Junta general 18:00', body: 'Salón principal.', audience_role: ['employee'] })
      .select()
      .single();
    if (annErr) throw annErr;
    console.log('  • Aviso insertado:', ann.title);

    const { data: media, error: mediaErr } = await supabase
      .from('media')
      .insert({ kind: 'url', title: 'Bienvenida', url: 'https://example.com/landing' })
      .select()
      .single();
    if (mediaErr) throw mediaErr;
    const statsRow = {
      display_id: display.id,
      position: 0,
      item_type: 'stats',
      item_id: null,
      duration_s: 10,
    };
    const mediaRow = {
      display_id: display.id,
      position: 1,
      item_type: 'media',
      item_id: media.id,
      duration_s: 20,
    };
    await supabase.from('display_playlists').insert([statsRow, mediaRow]);
    console.log('  • Playlist configurada (stats → media)');

    console.log('\n--- 5. Snapshot tras eventos ---');
    await printSnapshot(display.id);
  }

  console.log('\n--- 6. Heartbeat y estado ---');
  await supabase.rpc('display_heartbeat', { p_display_id: display.id, p_online: true });
  const { data: state, error: stateErr } = await supabase
    .from('displays')
    .select('status, last_seen_at')
    .eq('id', display.id)
    .single();
  if (stateErr) throw stateErr;
  console.log('  status:', state.status, '| last_seen_at:', state.last_seen_at);

  console.log('\nTest de display completado ✓');
}

async function printSnapshot(displayId) {
  const { data: snap, error } = await supabase.rpc('display_snapshot', { p_display_id: displayId });
  if (error) throw error;
  console.log('  branch:', snap.branch?.name);
  console.log('  counts:', JSON.stringify(snap.counts));
  console.log('  últimas checadas:', snap.last_checks.length);
  for (const c of snap.last_checks.slice(0, 3)) {
    console.log(`    ${c.name}  ${c.time}  ${c.label}`);
  }
  console.log('  avisos:', snap.announcements.length);
  console.log('  playlist:', snap.playlist.length, 'ítems');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});