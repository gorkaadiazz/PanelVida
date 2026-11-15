import { esMedio, MEDIO_POR_DEFECTO, MEDIOS, NOMBRE_MEDIO } from '../lib/dinero'

/** Tarjeta o efectivo (gastos e ingresos). Va al lado de «Gasto / Ingreso». */
export function CampoMedio({ id, valor, cambiar }: { id: string; valor: string; cambiar: (medio: string) => void }) {
  // '' (sin elegir) se enseña como tarjeta, que es lo que se guarda
  const elegido = esMedio(valor) ? valor : MEDIO_POR_DEFECTO
  return (
    <fieldset className="segmentos">
      <legend className="visually-hidden">Con tarjeta o en efectivo</legend>
      {MEDIOS.map((medio) => (
        <label key={medio}>
          <input type="radio" name={`${id}-medio`} value={medio} checked={elegido === medio} onChange={() => cambiar(medio)} />
          {NOMBRE_MEDIO[medio]}
        </label>
      ))}
    </fieldset>
  )
}
