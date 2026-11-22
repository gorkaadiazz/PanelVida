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
// - Importes en céntimos (`bigint`) llegan como `number` (máx. < 10^11, seguro en JS).
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
      agentes: {
        Row: {
          apps: string[]
          created_at: string
          id: string
          nombre: string
          ultimo_latido: string | null
          updated_at: string
          user_id: string
          version: string | null
        }
        Insert: {
          apps?: string[]
          created_at?: string
          id: string
          nombre: string
          ultimo_latido?: string | null
          updated_at?: string
          user_id: string
          version?: string | null
        }
        Update: {
          apps?: string[]
          created_at?: string
          id?: string
          nombre?: string
          ultimo_latido?: string | null
          updated_at?: string
          user_id?: string
          version?: string | null
        }
        Relationships: []
      }
      borrados_hogar: {
        Row: {
          fila_id: string
          hogar_id: string
          id: number
          sync_at: string
          tabla: string
        }
        Insert: {
          fila_id: string
          hogar_id: string
          id?: number
          sync_at?: string
          tabla: string
        }
        Update: {
          fila_id?: string
          hogar_id?: string
          id?: number
          sync_at?: string
          tabla?: string
        }
        Relationships: []
      }
      compra_casa: {
        Row: {
          cantidad: string | null
          comprado: boolean
          comprado_en: string | null
          created_at: string
          hogar_id: string
          id: string
          marcado_por: string | null
          nombre: string
          notas: string
          seccion: string | null
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cantidad?: string | null
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          hogar_id: string
          id?: string
          marcado_por?: string | null
          nombre: string
          notas?: string
          seccion?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cantidad?: string | null
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          hogar_id?: string
          id?: string
          marcado_por?: string | null
          nombre?: string
          notas?: string
          seccion?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hogar_invitaciones: {
        Row: {
          caduca_en: string
          codigo_hash: string
          created_at: string
          hogar_id: string
          id: string
          usado_en: string | null
          usado_por: string | null
          user_id: string
        }
        Insert: {
          caduca_en: string
          codigo_hash: string
          created_at?: string
          hogar_id: string
          id?: string
          usado_en?: string | null
          usado_por?: string | null
          user_id?: string
        }
        Update: {
          caduca_en?: string
          codigo_hash?: string
          created_at?: string
          hogar_id?: string
          id?: string
          usado_en?: string | null
          usado_por?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hogar_miembros: {
        Row: {
          created_at: string
          hogar_id: string
          nombre: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hogar_id: string
          nombre: string
          user_id: string
        }
        Update: {
          created_at?: string
          hogar_id?: string
          nombre?: string
          user_id?: string
        }
        Relationships: []
      }
      hogares: {
        Row: {
          created_at: string
          id: string
          nombre: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compra_frecuentes: {
        Row: {
          clave: string
          created_at: string
          id: string
          nombre: string
          seccion: string | null
          sync_at: string
          ultima: string
          updated_at: string
          user_id: string
          veces: number
        }
        Insert: {
          clave: string
          created_at?: string
          id?: string
          nombre: string
          seccion?: string | null
          sync_at?: string
          ultima?: string
          updated_at?: string
          user_id?: string
          veces?: number
        }
        Update: {
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
          seccion?: string | null
          sync_at?: string
          ultima?: string
          updated_at?: string
          user_id?: string
          veces?: number
        }
        Relationships: []
      }
      compra_mia: {
        Row: {
          cantidad: string | null
          comprado: boolean
          comprado_en: string | null
          created_at: string
          id: string
          nombre: string
          notas: string
          seccion: string | null
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cantidad?: string | null
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          id?: string
          nombre: string
          notas?: string
          seccion?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cantidad?: string | null
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          id?: string
          nombre?: string
          notas?: string
          seccion?: string | null
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      clientes_web: {
        Row: {
          created_at: string
          estado: string
          id: string
          nombre: string
          notas: string
          orden: number
          precio_centimos: number
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          notas?: string
          orden?: number
          precio_centimos?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          notas?: string
          orden?: number
          precio_centimos?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cumpleanos: {
        Row: {
          anio: number | null
          created_at: string
          dia: number
          id: string
          mes: number
          nombre: string
          notas: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          dia: number
          id?: string
          mes: number
          nombre: string
          notas?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          dia?: number
          id?: string
          mes?: number
          nombre?: string
          notas?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deseos: {
        Row: {
          articulo: string
          comprado: boolean
          comprado_en: string | null
          created_at: string
          enlace: string | null
          id: string
          notas: string
          precio_centimos: number
          prioridad: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          articulo: string
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          enlace?: string | null
          id?: string
          notas?: string
          precio_centimos: number
          prioridad?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          articulo?: string
          comprado?: boolean
          comprado_en?: string | null
          created_at?: string
          enlace?: string | null
          id?: string
          notas?: string
          precio_centimos?: number
          prioridad?: string
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
      habito_marcas: {
        Row: {
          created_at: string
          fecha: string
          habito_id: string
          hecho: boolean
          id: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          habito_id: string
          hecho?: boolean
          id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          habito_id?: string
          hecho?: boolean
          id?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habito_marcas_habito_id_user_id_fkey"
            columns: ["habito_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habitos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habitos: {
        Row: {
          archivado: boolean
          created_at: string
          id: string
          nombre: string
          orden: number
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archivado?: boolean
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archivado?: boolean
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          archivada: boolean
          created_at: string
          id: string
          sync_at: string
          texto: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archivada?: boolean
          created_at?: string
          id?: string
          sync_at?: string
          texto: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archivada?: boolean
          created_at?: string
          id?: string
          sync_at?: string
          texto?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      modulos: {
        Row: {
          abreviatura: string
          color: string
          con_examenes: boolean
          created_at: string
          foto: string | null
          horas_semanales: number | null
          id: string
          imagen: string | null
          limite_faltas: number | null
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
          con_examenes?: boolean
          created_at?: string
          foto?: string | null
          horas_semanales?: number | null
          id?: string
          imagen?: string | null
          limite_faltas?: number | null
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
          con_examenes?: boolean
          created_at?: string
          foto?: string | null
          horas_semanales?: number | null
          id?: string
          imagen?: string | null
          limite_faltas?: number | null
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
      movimientos: {
        Row: {
          categoria: string | null
          concepto: string
          created_at: string
          fecha: string
          fijo_id: string | null
          id: string
          importe_centimos: number
          medio: string
          necesidad: string | null
          sync_at: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: string | null
          concepto: string
          created_at?: string
          fecha: string
          fijo_id?: string | null
          id?: string
          importe_centimos: number
          medio?: string
          necesidad?: string | null
          sync_at?: string
          tipo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          categoria?: string | null
          concepto?: string
          created_at?: string
          fecha?: string
          fijo_id?: string | null
          id?: string
          importe_centimos?: number
          medio?: string
          necesidad?: string | null
          sync_at?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      movimientos_fijos: {
        Row: {
          activo: boolean
          categoria: string | null
          concepto: string
          created_at: string
          desde: string
          dia: number
          frecuencia: string
          id: string
          importe_centimos: number
          inicio: string
          mes: number | null
          medio: string
          necesidad: string | null
          sync_at: string
          tipo: string
          ultimo_apunte: string | null
          ultimo_mes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          concepto: string
          created_at?: string
          desde: string
          dia: number
          frecuencia?: string
          id?: string
          importe_centimos: number
          inicio?: string
          mes?: number | null
          medio?: string
          necesidad?: string | null
          sync_at?: string
          tipo: string
          ultimo_apunte?: string | null
          ultimo_mes?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          concepto?: string
          created_at?: string
          desde?: string
          dia?: number
          frecuencia?: string
          id?: string
          importe_centimos?: number
          inicio?: string
          mes?: number | null
          medio?: string
          necesidad?: string | null
          sync_at?: string
          tipo?: string
          ultimo_apunte?: string | null
          ultimo_mes?: string | null
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
          meta_ahorro_centimos: number | null
          mi_panel_inicializado: boolean
          nombre: string
          preferencias: Json
          semanas_curso: number
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
          meta_ahorro_centimos?: number | null
          mi_panel_inicializado?: boolean
          nombre?: string
          preferencias?: Json
          semanas_curso?: number
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
          meta_ahorro_centimos?: number | null
          mi_panel_inicializado?: boolean
          nombre?: string
          preferencias?: Json
          semanas_curso?: number
          sync_at?: string
          tema?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planes: {
        Row: {
          comentario: string
          con_quien: string
          coste_centimos: number | null
          created_at: string
          estado: string
          fecha: string | null
          id: string
          notas: string
          sync_at: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
          valoracion: number | null
        }
        Insert: {
          comentario?: string
          con_quien?: string
          coste_centimos?: number | null
          created_at?: string
          estado?: string
          fecha?: string | null
          id?: string
          notas?: string
          sync_at?: string
          tipo?: string
          titulo: string
          updated_at?: string
          user_id?: string
          valoracion?: number | null
        }
        Update: {
          comentario?: string
          con_quien?: string
          coste_centimos?: number | null
          created_at?: string
          estado?: string
          fecha?: string | null
          id?: string
          notas?: string
          sync_at?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          valoracion?: number | null
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
      revisiones: {
        Row: {
          created_at: string
          datos: Json
          fin: string
          id: string
          inicio: string
          sync_at: string
          tipo: string
          updated_at: string
          user_id: string
          vista: boolean
        }
        Insert: {
          created_at?: string
          datos: Json
          fin: string
          id?: string
          inicio: string
          sync_at?: string
          tipo: string
          updated_at?: string
          user_id?: string
          vista?: boolean
        }
        Update: {
          created_at?: string
          datos?: Json
          fin?: string
          id?: string
          inicio?: string
          sync_at?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          vista?: boolean
        }
        Relationships: []
      }
      suscripciones_push: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          hora: number
          id: string
          p256dh: string
          ultimo_envio: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          hora?: number
          id?: string
          p256dh: string
          ultimo_envio?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          hora?: number
          id?: string
          p256dh?: string
          ultimo_envio?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tareas: {
        Row: {
          created_at: string
          fecha_limite: string | null
          hecha: boolean
          hecha_en: string | null
          id: string
          sync_at: string
          texto: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha_limite?: string | null
          hecha?: boolean
          hecha_en?: string | null
          id?: string
          sync_at?: string
          texto: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha_limite?: string | null
          hecha?: boolean
          hecha_en?: string | null
          id?: string
          sync_at?: string
          texto?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      puente: {
        Row: {
          archivo_bytes: number | null
          archivo_nombre: string | null
          archivo_ruta: string | null
          archivo_tipo: string | null
          contenido: string
          created_at: string
          dispositivo: string
          fijado: boolean
          id: string
          origen_agente: string | null
          sync_at: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archivo_bytes?: number | null
          archivo_nombre?: string | null
          archivo_ruta?: string | null
          archivo_tipo?: string | null
          contenido?: string
          created_at?: string
          dispositivo?: string
          fijado?: boolean
          id?: string
          origen_agente?: string | null
          sync_at?: string
          tipo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archivo_bytes?: number | null
          archivo_nombre?: string | null
          archivo_ruta?: string | null
          archivo_tipo?: string | null
          contenido?: string
          created_at?: string
          dispositivo?: string
          fijado?: boolean
          id?: string
          origen_agente?: string | null
          sync_at?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      traspasos: {
        Row: {
          created_at: string
          fecha: string
          id: string
          importe_centimos: number
          sentido: string
          sync_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: string
          importe_centimos: number
          sentido: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          importe_centimos?: number
          sentido?: string
          sync_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      crear_codigo_vinculacion: {
        Args: never
        Returns: { codigo: string; caduca_en: string }[]
      }
      crear_invitacion: {
        Args: never
        Returns: { codigo: string; caduca_en: string }[]
      }
      unirse_hogar: {
        Args: { codigo: string }
        Returns: string
      }
      tipo_cuenta: {
        Args: never
        Returns: string | null
      }
      fecha_en_mes: {
        Args: { dia: number; mes: string }
        Returns: string
      }
      inicializar_cuenta: {
        Args: never
        Returns: boolean
      }
      secreto_cron_valido: {
        Args: { secreto: string }
        Returns: boolean
      }
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
