import { NECESIDADES, NOMBRE_NECESIDAD } from '../lib/dinero'

/** Esencial o prescindible (opcional). Solo tiene sentido en gastos. */
export function CampoNecesidad({ id, valor, cambiar }: { id: string; valor: string; cambiar: (necesidad: string) => void }) {
  return (
    <div className="field field--fecha">
      <label htmlFor={id} className="field__label">
        ¿Es necesario?
      </label>
      <select id={id} className="input" value={valor} onChange={(e) => cambiar(e.target.value)}>
        <option value="">Sin marcar</option>
        {NECESIDADES.map((n) => (
          <option key={n} value={n}>
            {NOMBRE_NECESIDAD[n]}
          </option>
        ))}
      </select>
    </div>
  )
}
