// Casos límite (tester) del vigilante de la red: salidas reales de `ip -j`
// (con la forma exacta de iproute2, MAC inventadas) y salidas raras.
import { describe, expect, it } from 'vitest'
import { enCasa, esIPv4, fabricante, ipsAProbar, leerDireccion, leerOui, leerRutaPorDefecto, leerVecinos } from './red.ts'

describe('leerVecinos con la salida real de `ip -j neigh`', () => {
  // Misma forma que la de un PC con Wi-Fi: IPv6 del router con "router": null
  const real =
    '[{"dst":"192.168.1.34","dev":"wlan0","lladdr":"b4:00:00:00:00:01","state":["STALE"]},' +
    '{"dst":"192.168.1.1","dev":"wlan0","lladdr":"74:00:00:00:00:02","state":["REACHABLE"]},' +
    '{"dst":"192.168.1.33","dev":"wlan0","lladdr":"00:eb:00:00:00:03","state":["STALE"]},' +
    '{"dst":"fe80::7600:ff:fe00:2","dev":"wlan0","lladdr":"74:00:00:00:00:02","router":null,"state":["STALE"]}]\n'
  it('lee los IPv4 y no confunde el IPv6 del router', () => {
    expect(leerVecinos(real)).toEqual([
      { ip: '192.168.1.34', mac: 'b4:00:00:00:00:01' },
      { ip: '192.168.1.1', mac: '74:00:00:00:00:02' },
      { ip: '192.168.1.33', mac: '00:eb:00:00:00:03' },
    ])
  })
  it('con el router en la tabla, estás en casa; si su MAC no coincide, no', () => {
    const v = leerVecinos(real)
    expect(enCasa(v, '192.168.1.1', '74:00:00:00:00:02')).toBe(true)
    expect(enCasa(v, '192.168.1.1', '74:00:00:00:00:03')).toBe(false)
    // La MAC del router puesta en otra IP de la tabla no basta
    expect(enCasa(v, '192.168.1.34', '74:00:00:00:00:02')).toBe(false)
  })
  it('estados con varias marcas, en minúsculas o vacíos', () => {
    const s = JSON.stringify([
      { dst: '10.0.0.2', lladdr: '00:11:22:33:44:01', state: ['STALE', 'PROXY'] },
      { dst: '10.0.0.3', lladdr: '00:11:22:33:44:02', state: ['reachable'] },
      { dst: '10.0.0.4', lladdr: '00:11:22:33:44:03', state: [] },
      { dst: '10.0.0.5', lladdr: '00:11:22:33:44:04', state: 'REACHABLE' },
      { dst: '10.0.0.6', lladdr: '00:11:22:33:44:05' },
      { dst: '10.0.0.7', lladdr: '00:11:22:33:44:06', state: ['FAILED', 'INCOMPLETE'] },
    ])
    expect(leerVecinos(s)).toEqual([{ ip: '10.0.0.2', mac: '00:11:22:33:44:01' }])
  })
  it('IPs y MAC con mala forma o tipos raros', () => {
    const s = JSON.stringify([
      { dst: '192.168.1.256', lladdr: '00:11:22:33:44:01', state: ['REACHABLE'] },
      { dst: '192.168.01.2', lladdr: '00:11:22:33:44:01', state: ['REACHABLE'] },
      { dst: ' 192.168.1.2', lladdr: '00:11:22:33:44:01', state: ['REACHABLE'] },
      { dst: 3232235778, lladdr: '00:11:22:33:44:01', state: ['REACHABLE'] },
      { dst: '192.168.1.3', lladdr: '00:11:22:33:44', state: ['REACHABLE'] },
      { dst: '192.168.1.4', lladdr: '00:11:22:33:44:55:66', state: ['REACHABLE'] },
      { dst: '192.168.1.5', lladdr: 1234, state: ['REACHABLE'] },
      { dst: '192.168.1.6', lladdr: '0g:11:22:33:44:55', state: ['REACHABLE'] },
      { dst: '192.168.1.7', lladdr: '33:33:00:00:00:01', state: ['REACHABLE'] }, // multicast IPv6
    ])
    expect(leerVecinos(s)).toEqual([])
  })
  it('vacío, null, texto enorme o JSON roto', () => {
    expect(leerVecinos('')).toEqual([])
    expect(leerVecinos('[]')).toEqual([])
    expect(leerVecinos('null')).toEqual([])
    expect(leerVecinos('[{"dst":"1.2.3.4"')).toEqual([])
    expect(leerVecinos('"[]"')).toEqual([])
  })
  it('la misma MAC con dos IP: se queda la primera', () => {
    const s = JSON.stringify([
      { dst: '192.168.1.8', lladdr: '00:11:22:33:44:01', state: ['STALE'] },
      { dst: '192.168.1.9', lladdr: '00:11:22:33:44:01', state: ['REACHABLE'] },
    ])
    expect(leerVecinos(s)).toEqual([{ ip: '192.168.1.8', mac: '00:11:22:33:44:01' }])
  })
})

describe('leerRutaPorDefecto con salidas reales y raras', () => {
  it('la real de un PC con DHCP', () => {
    expect(leerRutaPorDefecto('[{"dst":"default","gateway":"192.168.1.1","dev":"wlan0","protocol":"dhcp","prefsrc":"192.168.1.104","metric":600,"flags":[]}]\n')).toEqual({ ip: '192.168.1.1', dev: 'wlan0' })
  })
  it('VPN sin puerta de enlace delante: se salta y coge la siguiente', () => {
    const s = '[{"dst":"default","dev":"wg0","scope":"link","flags":[]},{"dst":"default","gateway":"192.168.1.1","dev":"enp3s0","metric":100,"flags":[]}]'
    expect(leerRutaPorDefecto(s)).toEqual({ ip: '192.168.1.1', dev: 'enp3s0' })
  })
  it('sin red, nulls y nombres de interfaz raros', () => {
    expect(leerRutaPorDefecto('')).toBeNull()
    expect(leerRutaPorDefecto('[null]')).toBeNull()
    expect(leerRutaPorDefecto('{"gateway":"192.168.1.1","dev":"wlan0"}')).toBeNull()
    expect(leerRutaPorDefecto('[{"gateway":"fe80::1","dev":"wlan0"}]')).toBeNull()
    expect(leerRutaPorDefecto('[{"gateway":"192.168.1.1","dev":"-wlan0"}]')).not.toBeNull() // va justo tras «dev»: ip lo toma como nombre, no como opción
    expect(leerRutaPorDefecto('[{"gateway":"192.168.1.1","dev":"una-interfaz-larga"}]')).toBeNull()
    expect(leerRutaPorDefecto('[{"gateway":"192.168.1.1","dev":"wl an0"}]')).toBeNull()
    expect(leerRutaPorDefecto('[{"gateway":"192.168.1.1","dev":""}]')).toBeNull()
    expect(leerRutaPorDefecto('[{"gateway":"192.168.1.1"}]')).toBeNull()
  })
})

describe('leerDireccion con salidas reales y raras', () => {
  it('la real de `ip -j -4 addr show dev wlan0`', () => {
    const s =
      '[{"ifindex":2,"ifname":"wlan0","flags":["BROADCAST","MULTICAST","UP","LOWER_UP"],"mtu":1500,"qdisc":"noqueue","operstate":"UP","group":"default","txqlen":1000,' +
      '"addr_info":[{"family":"inet","local":"192.168.1.104","prefixlen":24,"broadcast":"192.168.1.255","scope":"global","dynamic":true,"noprefixroute":true,"label":"wlan0","valid_life_time":6189,"preferred_life_time":6189}]}]'
    expect(leerDireccion(s)).toEqual({ ip: '192.168.1.104', prefijo: 24 })
  })
  it('interfaz sin IPv4 (ip devuelve [{}] o []), prefijos fuera de rango', () => {
    expect(leerDireccion('[{}]')).toBeNull()
    expect(leerDireccion('[]')).toBeNull()
    expect(leerDireccion('[{"addr_info":[]}]')).toBeNull()
    expect(leerDireccion('[{"addr_info":[{"family":"inet","local":"10.0.0.2","prefixlen":7}]}]')).toBeNull()
    expect(leerDireccion('[{"addr_info":[{"family":"inet","local":"10.0.0.2","prefixlen":33}]}]')).toBeNull()
    expect(leerDireccion('[{"addr_info":[{"family":"inet","local":"10.0.0.2","prefixlen":"24"}]}]')).toBeNull()
    expect(leerDireccion('[{"addr_info":[null, {"family":"inet","local":"10.0.0.2","prefixlen":16}]}]')).toEqual({ ip: '10.0.0.2', prefijo: 16 })
  })
  it('un prefijo que no es entero no se acepta', () => {
    expect(leerDireccion('[{"addr_info":[{"family":"inet","local":"10.0.0.2","prefixlen":24.5}]}]')).toBeNull()
  })
  it('dos direcciones: la primera', () => {
    expect(leerDireccion('[{"addr_info":[{"family":"inet","local":"192.168.1.5","prefixlen":24},{"family":"inet","local":"192.168.1.6","prefixlen":24}]}]')).toEqual({ ip: '192.168.1.5', prefijo: 24 })
  })
})

describe('ipsAProbar en los bordes', () => {
  it('/30 y /31', () => {
    expect(ipsAProbar('10.0.0.5', 30)).toEqual(['10.0.0.6'])
    expect(ipsAProbar('10.0.0.5', 31)).toEqual([])
  })
  it('/29: 6 hosts menos el tuyo', () => {
    expect(ipsAProbar('192.168.1.9', 29)).toEqual(['192.168.1.10', '192.168.1.11', '192.168.1.12', '192.168.1.13', '192.168.1.14'])
  })
  it('/25 en la mitad baja', () => {
    const ips = ipsAProbar('192.168.1.5', 25)
    expect(ips).toHaveLength(125)
    expect(ips[0]).toBe('192.168.1.1')
    expect(ips.at(-1)).toBe('192.168.1.126')
  })
  it('tu IP en el borde del /24 (.1 y .254)', () => {
    expect(ipsAProbar('192.168.1.1', 24)).toHaveLength(253)
    expect(ipsAProbar('192.168.1.1', 24)[0]).toBe('192.168.1.2')
    expect(ipsAProbar('192.168.1.254', 24).at(-1)).toBe('192.168.1.253')
  })
  it('/8: nunca más de 254', () => {
    const ips = ipsAProbar('10.20.30.40', 8)
    expect(ips).toHaveLength(253)
    expect(ips.every((i) => i.startsWith('10.20.30.'))).toBe(true)
  })
  it('prefijos sin sentido: nada', () => {
    expect(ipsAProbar('10.0.0.5', Number.NaN)).toEqual([])
    expect(ipsAProbar('10.0.0.5', 33)).toEqual([])
    expect(ipsAProbar('10.0.0.256', 24)).toEqual([])
  })
  it('todas las IPs que salen son IPv4 válidas', () => {
    for (const p of [8, 16, 24, 25, 26, 27, 28, 29, 30]) {
      for (const ip of ipsAProbar('172.16.5.77', p)) expect(esIPv4(ip)).toBe(true)
    }
  })
})

describe('leerOui con un trozo del oui.csv real del IEEE', () => {
  // Líneas con la forma exacta del archivo (CRLF, comillas, dirección vacía o entre comillas)
  const csv = [
    'Registry,Assignment,Organization Name,Organization Address',
    'MA-L,002272,American Micro-Fuel Device Corp.,2181 Buchanan Loop Ferndale WA US 98248 ',
    'MA-L,00D0EF,IGT,9295 PROTOTYPE DRIVE RENO NV US 89511 ',
    'MA-L,F4BD9E,"Cisco Systems, Inc",80 West Tasman Drive San Jose CA US 94568 ',
    'MA-L,5885E9,Realme Chongqing MobileTelecommunications Corp Ltd,"No.24 Nichang Boulevard, Huixing Block, Yubei District, Chongqing China CN 401120 "',
    'MA-L,F8E43B,ASIX Electronics Corporation,',
    'MA-L,0050C2,IEEE Registration Authority,',
    'MA-L,08EA44,"Extreme Networks Headquarters",2121 RDU Center Drive Morrisville NC US 27560 ',
    'MA-L,ACDE48,Private,',
    'MA-L,1C,Corto,x',
    'MA-L,ZZZZZZ,Malo,x',
    'MA-S,70B3D5F2F,Otro,x',
    'MA-L,00000C,"",x',
    '',
  ].join('\r\n')
  const tabla = leerOui(csv)

  it('lee los MA-L (también con CRLF) y salta lo que no tiene forma', () => {
    expect(tabla.get('002272')).toBe('American Micro-Fuel Device Corp.')
    expect(tabla.get('F4BD9E')).toBe('Cisco Systems, Inc')
    expect(tabla.get('5885E9')).toBe('Realme Chongqing MobileTelecommunications Corp Ltd')
    expect(tabla.get('F8E43B')).toBe('ASIX Electronics Corporation')
    expect(tabla.get('08EA44')).toBe('Extreme Networks Headquarters')
    expect(tabla.has('ZZZZZZ')).toBe(false)
    expect(tabla.has('00000C')).toBe(false) // nombre vacío
    expect([...tabla.values()].every((n) => !n.includes('\r'))).toBe(true)
    expect(tabla.size).toBe(8)
  })
  it('fabricante por MAC en minúsculas', () => {
    expect(fabricante('f4:bd:9e:12:34:56', tabla)).toBe('Cisco Systems, Inc')
    expect(fabricante('00:d0:ef:00:00:01', tabla)).toBe('IGT')
    expect(fabricante('00:d0:ee:00:00:01', tabla)).toBeNull()
  })
  it('nombres larguísimos se recortan a 80', () => {
    const t = leerOui(`MA-L,AABBCC,${'x'.repeat(300)},dir`)
    expect(t.get('AABBCC')).toHaveLength(80)
  })
  it('un archivo vacío o que no es el CSV: tabla vacía', () => {
    expect(leerOui('').size).toBe(0)
    expect(leerOui('<html>404</html>').size).toBe(0)
  })
})
