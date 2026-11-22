import { describe, expect, it } from 'vitest'
import { enCasa, esMacAleatoria, fabricante, ipsAProbar, leerDireccion, leerOui, leerRutaPorDefecto, leerVecinos, normalizarMacVecino } from './red.ts'

describe('leerVecinos (ip -j neigh)', () => {
  const salida = JSON.stringify([
    { dst: '192.168.1.1', dev: 'wlan0', lladdr: 'A4:2B:B0:11:22:33', state: ['REACHABLE'] },
    { dst: '192.168.1.20', dev: 'wlan0', lladdr: 'da:a1:19:00:00:01', state: ['STALE'] },
    { dst: '192.168.1.30', dev: 'wlan0', state: ['FAILED'] },
    { dst: '192.168.1.31', dev: 'wlan0', lladdr: '00:11:22:33:44:55', state: ['INCOMPLETE'] },
    { dst: 'fe80::1', dev: 'wlan0', lladdr: '00:11:22:33:44:66', state: ['REACHABLE'] },
    { dst: '192.168.1.255', dev: 'wlan0', lladdr: 'ff:ff:ff:ff:ff:ff', state: ['PERMANENT'] },
    { dst: '192.168.1.40', dev: 'wlan0', lladdr: '01:00:5e:00:00:fb', state: ['REACHABLE'] },
    { dst: '192.168.1.21', dev: 'wlan0', lladdr: 'da:a1:19:00:00:01', state: ['DELAY'] },
  ])
  it('solo IPv4 que han contestado, con MAC de verdad y sin repetir', () => {
    expect(leerVecinos(salida)).toEqual([
      { ip: '192.168.1.1', mac: 'a4:2b:b0:11:22:33' },
      { ip: '192.168.1.20', mac: 'da:a1:19:00:00:01' },
    ])
  })
  it('basura → nada', () => {
    expect(leerVecinos('no es json')).toEqual([])
    expect(leerVecinos('{"a":1}')).toEqual([])
    expect(leerVecinos('[null, 3, {"dst": "1.2.3.4"}]')).toEqual([])
  })
})

describe('ruta y dirección', () => {
  it('puerta de enlace', () => {
    expect(leerRutaPorDefecto('[{"dst":"default","gateway":"192.168.1.1","dev":"wlan0"}]')).toEqual({ ip: '192.168.1.1', dev: 'wlan0' })
    expect(leerRutaPorDefecto('[{"dst":"default","gateway":"192.168.1.1","dev":"wlan0; rm -rf /"}]')).toBeNull()
    expect(leerRutaPorDefecto('[]')).toBeNull()
  })
  it('tu IP y prefijo', () => {
    expect(leerDireccion('[{"ifname":"wlan0","addr_info":[{"family":"inet","local":"192.168.1.50","prefixlen":24}]}]')).toEqual({ ip: '192.168.1.50', prefijo: 24 })
    expect(leerDireccion('[{"addr_info":[{"family":"inet6","local":"fe80::1","prefixlen":64}]}]')).toBeNull()
  })
})

describe('ipsAProbar', () => {
  it('un /24 sin red, difusión ni la tuya', () => {
    const ips = ipsAProbar('192.168.1.50', 24)
    expect(ips).toHaveLength(253)
    expect(ips[0]).toBe('192.168.1.1')
    expect(ips.at(-1)).toBe('192.168.1.254')
    expect(ips).not.toContain('192.168.1.50')
  })
  it('una red más grande se limita a tu /24; una más pequeña, a la suya', () => {
    expect(ipsAProbar('10.0.5.7', 16)).toHaveLength(253)
    expect(ipsAProbar('10.0.5.7', 16)[0]).toBe('10.0.5.1')
    expect(ipsAProbar('192.168.1.130', 25)).toHaveLength(125)
    expect(ipsAProbar('192.168.1.130', 25)[0]).toBe('192.168.1.129')
    expect(ipsAProbar('192.168.1.1', 32)).toEqual([])
    expect(ipsAProbar('no-ip', 24)).toEqual([])
  })
})

describe('MAC', () => {
  it('aleatorias (administradas localmente)', () => {
    expect(esMacAleatoria('da:a1:19:00:00:01')).toBe(true)
    expect(esMacAleatoria('a6:00:00:00:00:00')).toBe(true)
    expect(esMacAleatoria('a4:2b:b0:11:22:33')).toBe(false)
    expect(esMacAleatoria('00:11:22:33:44:55')).toBe(false)
  })
  it('normalizar', () => {
    expect(normalizarMacVecino('A4:2B:B0:11:22:33')).toBe('a4:2b:b0:11:22:33')
    expect(normalizarMacVecino('ff:ff:ff:ff:ff:ff')).toBeNull()
    expect(normalizarMacVecino('00:00:00:00:00:00')).toBeNull()
    expect(normalizarMacVecino('a4-2b-b0-11-22-33')).toBeNull()
  })
})

describe('en casa', () => {
  const vecinos = [{ ip: '192.168.1.1', mac: 'a4:2b:b0:11:22:33' }]
  it('solo si el router es el de config.json', () => {
    expect(enCasa(vecinos, '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe(true)
    expect(enCasa(vecinos, '192.168.1.1', 'a4:2b:b0:11:22:34')).toBe(false)
    expect(enCasa(vecinos, '192.168.1.254', 'a4:2b:b0:11:22:33')).toBe(false)
    expect(enCasa(vecinos, '192.168.1.1', null)).toBe(false)
  })
})

describe('fabricante (oui.csv del IEEE)', () => {
  const csv = [
    'Registry,Assignment,Organization Name,Organization Address',
    'MA-L,A42BB0,"TP-LINK TECHNOLOGIES CO.,LTD.","Shenzhen"',
    'MA-L,001122,Cimsys Inc,Korea',
    'MA-M,AABBCC1,Otro,Sitio',
    'MA-L,286FB9,"Nokia ""Shanghai""‮",Somewhere',
  ].join('\n')
  const tabla = leerOui(csv)
  it('lee el CSV (comillas, comas dentro) y busca por los 3 primeros bytes', () => {
    expect(fabricante('a4:2b:b0:11:22:33', tabla)).toBe('TP-LINK TECHNOLOGIES CO.,LTD.')
    expect(fabricante('00:11:22:33:44:55', tabla)).toBe('Cimsys Inc')
    expect(tabla.get('286FB9')).toBe('Nokia "Shanghai"')
    expect(tabla.size).toBe(3)
  })
  it('una MAC aleatoria no tiene fabricante', () => {
    expect(fabricante('a6:2b:b0:11:22:33', tabla)).toBeNull()
  })
})

describe('routerDeCasa: solo si acaba de contestar con la MAC de casa', () => {
  const salida = (state: string[], mac = 'a4:2b:b0:11:22:33') => JSON.stringify([{ dst: '192.168.1.1', lladdr: mac, state }])
  it('REACHABLE o PERMANENT con la MAC de casa', async () => {
    const { routerDeCasa } = await import('./red.ts')
    expect(routerDeCasa(salida(['REACHABLE']), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('casa')
    expect(routerDeCasa(salida(['PERMANENT']), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('casa')
  })
  it('una entrada vieja hace esperar; otra MAC o nada, fuera', async () => {
    const { routerDeCasa } = await import('./red.ts')
    expect(routerDeCasa(salida(['STALE']), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('esperar')
    expect(routerDeCasa(salida(['DELAY']), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('esperar')
    expect(routerDeCasa(salida(['REACHABLE'], 'a4:2b:b0:11:22:34'), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('fuera')
    expect(routerDeCasa(salida(['FAILED']), '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('fuera')
    expect(routerDeCasa('[]', '192.168.1.1', 'a4:2b:b0:11:22:33')).toBe('fuera')
    expect(routerDeCasa(salida(['REACHABLE']), '192.168.1.1', null)).toBe('fuera')
  })
})
