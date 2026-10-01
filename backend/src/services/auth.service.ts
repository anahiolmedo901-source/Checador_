import { supabaseAdmin, supabaseAuth } from '../config/supabase';
import { employeeRepository } from '../repositories/employee.repository';
import { AuthenticatedUser, EmployeeRole, EmployeeWithRelations, LoginResponse } from '../types';
import { HTTPError } from '../utils/http-error';


const EMAIL_DOMAIN = 'check.local';

function toLoginEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (value.includes('@')) return value;
  return `${value}@${EMAIL_DOMAIN}`;
}

export const authService = {
  /** Inicia sesión contra Supabase Auth y devuelve la sesión + perfil. */
  async login(identifier: string, password: string): Promise<LoginResponse> {
    const email = toLoginEmail(identifier);
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      throw HTTPError.unauthorized('Credenciales inválidas.');
    }

    const employee = await employeeRepository.findById(data.user.id);
    if (!employee) {
      throw HTTPError.forbidden('No tienes un perfil de empleado asignado.');
    }
    if (!employee.active) {
      throw HTTPError.forbidden('Tu cuenta está inactiva. Contacta al administrador.');
    }

    return {
      access_token: data.session.access_token,
      user: { id: data.user.id, email: data.user.email ?? email },
      employee,
    };
  },

  /**
   * Crea usuario Auth + fila de empleado (login con `code@check.local`).
   * `callerRole` evita que un HR cree cuentas con rol administrador.
   */
  async createUser(
    payload: {
      code: string;
      full_name: string;
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      hire_date?: string | null;
      password: string;
      role: string;
      branch_id?: string | null;
      department_id?: string | null;
      position_id?: string | null;
    },
    callerRole?: EmployeeRole
  ): Promise<EmployeeWithRelations> {
    if (payload.role === 'admin' && callerRole !== 'admin') {
      throw HTTPError.forbidden('Solo un administrador puede asignar el rol de administrador.');
    }

    const existing = await employeeRepository.findByCode(payload.code);
    if (existing) {
      throw HTTPError.conflict(`El código ${payload.code} ya está en uso.`);
    }

    const email = `${payload.code.toLowerCase()}@${EMAIL_DOMAIN}`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.full_name },
    });
    if (error) {
      if (error.status === 422 || error.message.includes('already registered')) {
        throw HTTPError.conflict('El usuario ya está registrado en Supabase Auth.');
      }
      throw new HTTPError(500, 'No se pudo crear el usuario en Supabase Auth.', {
        code: 'AUTH_ERROR',
        details: error.message,
      });
    }

    try {
      return await employeeRepository.create({
        id: data.user.id,
        code: payload.code,
        full_name: payload.full_name,
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        hire_date: payload.hire_date,
        branch_id: payload.branch_id,
        department_id: payload.department_id,
        position_id: payload.position_id,
        role: payload.role,
      });
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw err;
    }
  },

  /** Actualiza NIP (Auth) y/o rol (DB). Solo el rol admin puede tocar cuentas admin. */
  async updateUser(
    id: string,
    patch: { password?: string; role?: string },
    callerRole?: EmployeeRole
  ): Promise<EmployeeWithRelations> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw HTTPError.notFound('Empleado no encontrado.');

    const touchesAdmin = employee.role === 'admin' || patch.role === 'admin';
    if (patch.password && employee.role === 'admin' && callerRole !== 'admin') {
      throw HTTPError.forbidden(
        'Solo un administrador puede restablecer la contraseña de un administrador.'
      );
    }
    if (patch.role && touchesAdmin && callerRole !== 'admin') {
      throw HTTPError.forbidden(
        'Solo un administrador puede cambiar el rol de una cuenta de administrador.'
      );
    }

    if (patch.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: patch.password,
      });
      if (error) {
        throw new HTTPError(500, 'No se pudo actualizar la contraseña.', {
          code: 'AUTH_ERROR',
          details: error.message,
        });
      }
    }

    if (patch.role) {
      return employeeRepository.update(id, { role: patch.role as never });
    }
    return employee;
  },

  /** Valida un access token y devuelve el empleado autenticado. */
  async getAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      throw HTTPError.unauthorized('Token inválido o expirado.');
    }

    const employee = await employeeRepository.findById(data.user.id);
    if (!employee || !employee.active) {
      throw HTTPError.forbidden('Cuenta de empleado no válida o inactiva.');
    }

    const role = employee.role;
    if (role !== 'admin' && role !== 'hr' && role !== 'employee') {
      throw HTTPError.forbidden('Rol no reconocido.');
    }

    return {
      id: data.user.id,
      email: data.user.email ?? '',
      role,
      employee,
    };
  },

  async logout(): Promise<{ success: true }> {
    // Supabase Auth usa tokens JWT (sesión stateless): el cliente descarta
    // el token localmente. Para revocación real se usaría revoke + denylist
    // en una fase posterior. El backend no acepta el token en /auth/* salvo /me.
    return { success: true };
  },
};
