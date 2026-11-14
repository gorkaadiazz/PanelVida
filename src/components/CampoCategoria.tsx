import { CATEGORIAS, NOMBRE_CATEGORIA } from '../lib/dinero'

/** Lista de categorías de gasto (opcional). Solo tiene sentido en gastos. */
export function CampoCategoria({ id, valor, cambiar }: { id: string; valor: string; cambiar: (categoria: string) => void }) {
  return (
    <div className="field field--fecha">
      <label htmlFor={id} className="field__label">
        Categoría
      </label>
      <select id={id} className="input" value={valor} onChange={(e) => cambiar(e.target.value)}>
        <option value="">Sin categoría</option>
        {CATEGORIAS.map((c) => (
          <option key={c} value={c}>
            {NOMBRE_CATEGORIA[c]}
          </option>
        ))}
      </select>
    </div>
  )
}
