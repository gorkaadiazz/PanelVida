// Agente del PC · conexión con Supabase como el usuario del agente.
// Nunca con la service role: con sus credenciales solo se puede lo que dejan
// las políticas RLS para un agente.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Credenciales } from './lib/config.ts'

export class Desvinculado extends Error {}

export async function conectar(c: Credenciales): Promise<SupabaseClient> {
  const cliente = createClient(c.supabaseUrl, c.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  })
  const { error } = await cliente.auth.signInWithPassword({ email: c.email, password: c.password })
  if (error) {
    // Credenciales que ya no valen: lo han desvinculado desde la app
    // (solo con ese código: otro 400, p. ej. el proveedor Email desactivado, es un fallo de configuración)
    if (error.code === 'invalid_credentials') throw new Desvinculado('Este PC ya no está vinculado.')
    throw error
  }
  return cliente
}
