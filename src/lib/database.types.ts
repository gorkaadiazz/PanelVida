// Tipos de la base de datos (esquema `public`), ESCRITOS A MANO a partir de
// las migraciones de supabase/migrations/ con el mismo formato que genera la
// CLI de Supabase.
//
// Cuando hagas `npx supabase login`, regenéralos (y sustituye este archivo) con:
//   npx supabase gen types typescript --project-id pmcacougksqimitapiqr > src/lib/database.types.ts
//
// Notas:
// - `numeric` llega como `number` y `timestamptz`/`date` como cadena ISO.
// - Las tablas `uso_ia` y `borrados` son de solo lectura para la app (RLS).
// - `emails_permitidos` no es accesible desde la app (sin políticas); está
//   aquí porque forma parte del esquema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Permite a supabase-js saber qué versión de PostgREST usa el proyecto
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      archivos: {
        Row: {
          created_at: string
          evaluacion_id: string | null
          id: string
          modulo_id: string | null
          nombre: string
          ruta: string | null
          sync_at: string
          tamano: number
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evaluacion_id?: string | null
          id?: string
          modulo_id?: string | null
          nombre: string
          ruta?: string | null
          sync_at?: string
          tamano: number
          tipo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          evaluacion_id?: string | null
          id?: string
          modulo_id?: string | null
          nombre?: string
          ruta?: string | null
          sync_at?: string
          tamano?: number
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archivos_evaluacion_id_user_id_fkey"
            columns: ["evaluacion_id", "user_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "archivos_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      borrados: {
        Row: {
          fila_id: string
          id: number
          sync_at: string
          tabla: string
          user_id: string
        }
        Insert: {
          fila_id: string
          id?: never
          sync_at?: string
          tabla: string
          user_id: string
        }
        Update: {
          fila_id?: string
          id?: never
          sync_at?: string
          tabla?: string
          user_id?: string
        }
        Relationships: []
      }
      chuletas: {
        Row: {
          categoria: string
          comando: string
          created_at: string
          descripcion: string
          id: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria: string
          comando: string
          created_at?: string
          descripcion?: string
          id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          categoria?: string
          comando?: string
          created_at?: string
          descripcion?: string
          id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      emails_permitidos: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      evaluacion_ra: {
        Row: {
          created_at: string
          evaluacion_id: string
          id: string
          peso: number
          ra_id: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evaluacion_id: string
          id?: string
          peso?: number
          ra_id: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          evaluacion_id?: string
          id?: string
          peso?: number
          ra_id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluacion_ra_evaluacion_id_user_id_fkey"
            columns: ["evaluacion_id", "user_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "evaluacion_ra_ra_id_user_id_fkey"
            columns: ["ra_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resultados_aprendizaje"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      evaluaciones: {
        Row: {
          created_at: string
          enlace: string | null
          estado: string
          evaluacion: string
          fecha: string
          id: string
          modulo_id: string
          nota: number | null
          notas: string
          sync_at: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enlace?: string | null
          estado?: string
          evaluacion?: string
          fecha: string
          id?: string
          modulo_id: string
          nota?: number | null
          notas?: string
          sync_at?: string
          tipo: string
          titulo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          enlace?: string | null
          estado?: string
          evaluacion?: string
          fecha?: string
          id?: string
          modulo_id?: string
          nota?: number | null
          notas?: string
          sync_at?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluaciones_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      examenes_ia: {
        Row: {
          created_at: string
          fecha: string
          id: string
          modulo_id: string
          nota: number | null
          preguntas: Json
          respuestas: Json
          sync_at: string
          temas: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          modulo_id: string
          nota?: number | null
          preguntas?: Json
          respuestas?: Json
          sync_at?: string
          temas?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          modulo_id?: string
          nota?: number | null
          preguntas?: Json
          respuestas?: Json
          sync_at?: string
          temas?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "examenes_ia_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      faltas: {
        Row: {
          created_at: string
          fecha: string
          horas: number
          id: string
          justificada: boolean
          modulo_id: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          horas?: number
          id?: string
          justificada?: boolean
          modulo_id: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          horas?: number
          id?: string
          justificada?: boolean
          modulo_id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faltas_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      fe_registros: {
        Row: {
          created_at: string
          fecha: string
          horas: number
          id: string
          sync_at: string
          tareas: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          horas: number
          id?: string
          sync_at?: string
          tareas?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          horas?: number
          id?: string
          sync_at?: string
          tareas?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          created_at: string
          id: string
          modulo_id: string
          nivel: number
          pregunta: string
          proxima_revision: string
          respuesta: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modulo_id: string
          nivel?: number
          pregunta: string
          proxima_revision?: string
          respuesta: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          modulo_id?: string
          nivel?: number
          pregunta?: string
          proxima_revision?: string
          respuesta?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      modulos: {
        Row: {
          abreviatura: string
          color: string
          created_at: string
          foto: string | null
          horas_semanales: number | null
          id: string
          imagen: string | null
          nombre: string
          orden: number
          profesor: string
          sistema_notas: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abreviatura: string
          color?: string
          created_at?: string
          foto?: string | null
          horas_semanales?: number | null
          id?: string
          imagen?: string | null
          nombre: string
          orden?: number
          profesor?: string
          sistema_notas?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          abreviatura?: string
          color?: string
          created_at?: string
          foto?: string | null
          horas_semanales?: number | null
          id?: string
          imagen?: string | null
          nombre?: string
          orden?: number
          profesor?: string
          sistema_notas?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          centro: string
          created_at: string
          curso: string
          id: string
          limite_faltas: number
          nombre: string
          preferencias: Json
          sync_at: string
          tema: string
          updated_at: string
          user_id: string
        }
        Insert: {
          centro?: string
          created_at?: string
          curso?: string
          id?: string
          limite_faltas?: number
          nombre?: string
          preferencias?: Json
          sync_at?: string
          tema?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          centro?: string
          created_at?: string
          curso?: string
          id?: string
          limite_faltas?: number
          nombre?: string
          preferencias?: Json
          sync_at?: string
          tema?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pomodoro_sesiones: {
        Row: {
          created_at: string
          id: string
          inicio: string
          minutos: number
          modulo_id: string | null
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inicio: string
          minutos: number
          modulo_id?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          inicio?: string
          minutos?: number
          modulo_id?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomodoro_sesiones_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      resultados_aprendizaje: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string
          id: string
          modulo_id: string
          peso: number
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string
          id?: string
          modulo_id: string
          peso?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string
          id?: string
          modulo_id?: string
          peso?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resultados_aprendizaje_modulo_id_user_id_fkey"
            columns: ["modulo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      temas: {
        Row: {
          created_at: string
          estudiado: boolean
          evaluacion_id: string
          id: string
          orden: number
          sync_at: string
          texto: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estudiado?: boolean
          evaluacion_id: string
          id?: string
          orden?: number
          sync_at?: string
          texto: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          estudiado?: boolean
          evaluacion_id?: string
          id?: string
          orden?: number
          sync_at?: string
          texto?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "temas_evaluacion_id_user_id_fkey"
            columns: ["evaluacion_id", "user_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      uso_ia: {
        Row: {
          created_at: string
          fecha: string
          id: string
          llamadas: number
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          llamadas?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          llamadas?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      sumar_uso_ia: {
        Args: { p_limite: number; p_user: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
