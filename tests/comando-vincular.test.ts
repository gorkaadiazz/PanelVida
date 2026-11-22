// El comando de vincular, pegado de verdad en bash (también interactivo, con
// el historial activo) y en fish: el nombre llega como UN argumento, tal cual
// se ve, y nada se ejecuta. Se salta si no están las shells.
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { comandoVincular } from '../src/lib/agentes'

const hay = (shell: string) => spawnSync(shell, ['-c', 'exit 0']).status === 0
const NOMBRES = ['$(touch /tmp/mipanel-pwned)', '`id`', 'PC!!', '!-1 x', '"; id; "', "l'aula (casa) & | ; < > * ? ~ {a,b} #x", 'a\\"b', 'Ñandú 💻']

// mipanel-agente falso: imprime sus argumentos separados por NUL
const FALSO_BASH = `mipanel-agente() { printf '%s\\0' "$@"; }`
const FALSO_FISH = `function mipanel-agente; printf '%s\\0' $argv; end`

function argumentos(salida: string): string[] {
  return salida.split('\0').filter((_, i, a) => i < a.length - 1)
}

describe.skipIf(!hay('bash'))('pegado en bash', () => {
  it.each(NOMBRES)('%j', (nombre) => {
    const comando = comandoVincular('ABCD-EFGH', nombre)
    const r = spawnSync('bash', ['--norc', '--noprofile', '-c', `${FALSO_BASH}\n${comando}`], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    const args = argumentos(r.stdout)
    expect(args.slice(0, 2)).toEqual(['vincular', 'ABCD-EFGH'])
    expect(args.length).toBeLessThanOrEqual(3)
    if (args[2] !== undefined) expect(comando).toContain(`"${args[2]}"`)
  })
  it('interactivo (con historial): ! no trae órdenes anteriores', () => {
    for (const nombre of ['PC!!', 'x !-1 y', '!echo']) {
      const comando = comandoVincular('ABCD-EFGH', nombre)
      const entrada = `${FALSO_BASH}\necho ORDEN_ANTERIOR\n${comando}\n`
      const r = spawnSync('bash', ['--norc', '--noprofile', '-i'], { input: entrada, encoding: 'utf8', env: { PATH: process.env.PATH, HISTFILE: '/dev/null', PS1: '', TERM: 'dumb' } })
      expect(r.stdout).toContain('vincular\0ABCD-EFGH')
      expect(r.stdout.split('vincular\0')[1]).not.toContain('ORDEN_ANTERIOR')
    }
  })
})

describe.skipIf(!hay('fish'))('pegado en fish', () => {
  it.each(NOMBRES)('%j', (nombre) => {
    const comando = comandoVincular('ABCD-EFGH', nombre)
    const r = spawnSync('fish', ['--no-config', '-c', `${FALSO_FISH}\n${comando}`], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    const args = argumentos(r.stdout)
    expect(args.slice(0, 2)).toEqual(['vincular', 'ABCD-EFGH'])
    expect(args.length).toBeLessThanOrEqual(3)
    if (args[2] !== undefined) expect(comando).toContain(`"${args[2]}"`)
  })
})
