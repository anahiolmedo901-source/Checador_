type SupabaseErrorLike = {
  message?: string;
  name?: string;
  code?: string;
};

export function getFriendlyError(err: unknown): string {
  const e = (err ?? {}) as SupabaseErrorLike;
  const message = e.message?.trim();

  if (!message) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';

  if (/email.*not authorized|invalid login credentials|invalid.*credentials/i.test(message)) {
    return 'Código o NIP incorrecto. Verifica tus datos.';
  }
  if (/pendiente de autorizaci/i.test(message)) {
    return 'Tu dispositivo está pendiente de autorización. Inténtalo más tarde.';
  }
  if (/no est[aá] autorizado/i.test(message)) {
    return 'Tu dispositivo no está autorizado. Contacta al administrador.';
  }
  if (/dispositivo.*desactivado|est[aá] desactivado/i.test(message)) {
    return 'Tu dispositivo está desactivado. Contacta al administrador.';
  }
  if (/sin conexi|sin internet/i.test(message)) {
    return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
  }
  if (/no existe o no te pertenece/i.test(message)) {
    return message;
  }
  if (/ya registraste|ya tienes|ya se registr/i.test(message)) {
    return message;
  }
  if (/te encuentras a|radio|ubicaci[oó]n simulada|No fue posible obtener tu ubicación/i.test(message)) {
    return message;
  }
  if (/already logged|session/i.test(message)) {
    return message;
  }
  if (/timed out|network|fetch|ECONNREFUSED|Failed to fetch|ERR_NETWORK/i.test(message)) {
    return 'No hay conexión con el servidor. Revisa tu internet.';
  }
  return message;
}