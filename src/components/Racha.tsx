import { IconoRacha } from './iconos'

/** "5 días" con su llama; se colorea cuando la racha está viva. */
export function Racha({ dias }: { dias: number }) {
  return (
    <span className={`racha${dias > 0 ? ' racha--viva' : ''}`}>
      <IconoRacha />
      <span>
        <span className="num">{dias}</span> {dias === 1 ? 'día' : 'días'}
        <span className="visually-hidden"> de racha</span>
      </span>
    </span>
  )
}
