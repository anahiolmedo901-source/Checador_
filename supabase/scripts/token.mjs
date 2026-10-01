// Administración de tokens de Smart Display (Fase 3).
// Uso (desde la raíz del repo):
//   node --env-file-if-exists=.env supabase/scripts/token.mjs rotate    <display-code>
//   node --env-file-if-exists=.env supabase/scripts/token.mjs revoke    <token-id>
//   node --env-file-if-exists=.env supabase/scripts/token.mjs revoke-all <display-code>
//
// Variables requeridas: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// El token en claro se imprime UNA vez: acércalo a la configuración de la TV.
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

const [command, arg] = process.argv.slice(2);

async function findByCode(code) {
  const { data, error } = await supabase
    .from('displays')
    .select('id, code, name, branch_id, is_active')
    .eq('code', String(code ?? '').trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error(`No existe un display con código "${code}".`);
    process.exit(1);
  }
  return data;
}

async function rotate(code) {
  const display = await findByCode(code);
  const { data, error } = await supabase.rpc('display_token_rotate', {
    p_display_id: display.id,
  });
  if (error) throw error;
  console.log('Token rotado ✓');
  console.log('');

  console.log('Pega esto en la configuración de la TV (lo verás UNA sola vez):');
  console.log('--------------------------------------------------------------');
  console.log(`  Display code ........ ${display.code} (${display.name})`);
  console.log(`  Display ID .......... ${display.id}`);
  console.log(`  Sucursal ............ ${display.branch_id}`);
  console.log(`  Token ................ ${data.token}`);
  console.log('--------------------------------------------------------------');
  console.log(`Token ID: ${data.token_id}`);
}

async function revoke(tokenId) {
  if (!tokenId) {
    console.error('Uso: token.mjs revoke <token-id>');
    process.exit(1);
  }
  const { error } = await supabase.rpc('display_token_revoke', {
    p_token_id: tokenId,
  });
  if (error) throw error;
  console.log(`Token ${tokenId} revocado ✓`);
}

async function revokeAll(code) {
  const display = await findByCode(code);
  const { error } = await supabase.rpc('display_token_revoke_all', {
    p_display_id: display.id,
  });
  if (error) throw error;
  console.log(`Todos los tokens de ${display.code} revocados ✓`);
}

(async () => {
  switch (command) {
    case 'rotate':
      await rotate(arg);
      break;
    case 'revoke':
      await revoke(arg);
      break;
    case 'revoke-all':
      await revokeAll(arg);
      break;
    default:
      console.log(
        ['Uso:', '  node supabase/scripts/token.mjs rotate    <display-code>',
         '  node supabase/scripts/token.mjs revoke    <token-id>',
         '  node supabase/scripts/token.mjs revoke-all <display-code>'].join('\n')
      );
      process.exit(1);
  }
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});