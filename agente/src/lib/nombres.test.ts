import { describe, expect, it } from 'vitest'
import { desescaparAvahi, esNombreHumano, hostLegible, leerAvahi, nombreDeRed } from './nombres.ts'

// Salida real de `avahi-browse -a -r -t -p` (recortada; MAC e ids inventados)
const AVAHI = [
  '+;wlan0;IPv4;Tele\\032sal\\195\\179n;_googlecast._tcp;local',
  '=;wlan0;IPv4;Tele\\032salón;_googlecast._tcp;local;abcd1234.local;192.168.1.40;8009;"fn=Tele salón"',
  '=;wlan0;IPv4;amzn\\.dmgr\\0584EE0FC13C525142FFD4D7DF5166C144C\\058xnVDMM;Amazon Fire TV;local;192-168-1-34.local;192.168.1.34;55442;',
  '=;wlan0;IPv4;AE361B13BA9496F6;_matterd._udp;local;B4E4543C86A8.local;192.168.1.34;5540;',
  '=;wlan0;IPv4;c0b437dbe87b088e;_spotify-connect._tcp;local;c0b437dbe87b088e.local;192.168.1.36;40143;',
  '=;wlan0;IPv6;Algo;_ipp._tcp;local;impresora.local;fe80::1;631;',
  '=;wlan0;IPv4;HP\\032LaserJet\\032M110w;_ipp._tcp;local;HP1234.local;192.168.1.50;631;',
  '=;wlan0;IPv4;x;_ssh._tcp;local;mi-servidor.local;192.168.1.60;22;',
  'basura',
].join('\n')

describe('leerAvahi', () => {
  const r = leerAvahi(AVAHI)
  it('agrupa por IP solo lo resuelto en IPv4', () => {
    expect([...r.keys()].sort()).toEqual(['192.168.1.34', '192.168.1.36', '192.168.1.40', '192.168.1.50', '192.168.1.60'])
    expect(r.get('192.168.1.34')?.tipos).toEqual(['Amazon Fire TV', '_matterd._udp'])
  })
  it('desescapa \\DDD', () => {
    expect(desescaparAvahi('HP\\032LaserJet')).toBe('HP LaserJet')
    expect(desescaparAvahi('a\\.b')).toBe('a.b')
  })
})

describe('nombreDeRed', () => {
  const r = leerAvahi(AVAHI)
  it('nombre propio con su tipo', () => {
    expect(nombreDeRed(r.get('192.168.1.40'), null)).toBe('Tele salón (Chromecast o Google TV)')
  })
  it('sin nombre legible: el tipo (Fire TV, Spotify)', () => {
    expect(nombreDeRed(r.get('192.168.1.34'), null)).toBe('Amazon Fire TV')
    expect(nombreDeRed(r.get('192.168.1.36'), null)).toBe('Altavoz o tele (Spotify)')
  })
  it('impresora con su modelo y un host legible', () => {
    expect(nombreDeRed(r.get('192.168.1.50'), null)).toBe('HP LaserJet M110w (Impresora)')
    expect(nombreDeRed(r.get('192.168.1.60'), null)).toBe('mi-servidor (Ordenador o servidor)')
  })
  it('sin anuncio: el nombre del DNS del router, si es legible', () => {
    expect(nombreDeRed(undefined, 'Galaxy-S23.home')).toBe('Galaxy-S23')
    expect(nombreDeRed(undefined, 'C83079000000.local')).toBeNull()
    expect(nombreDeRed(undefined, null)).toBeNull()
  })
  it('recorta a 60 caracteres', () => {
    const largo = leerAvahi(`=;wlan0;IPv4;${'Tele '.repeat(20)};_googlecast._tcp;local;x.local;192.168.1.9;1;`)
    expect([...(nombreDeRed(largo.get('192.168.1.9'), null) ?? '')].length).toBeLessThanOrEqual(60)
  })
})

describe('esNombreHumano y hostLegible', () => {
  it('descarta ids y direcciones', () => {
    for (const t of ['c0b437dbe87b088e', 'AE361B13BA9496F6', '370e230c-63df-4ce7-bd33-2d01bb1952d2', '192-168-1-34', 'B4E4543C86A8', 'x', 'amzn.dmgr\\058xy']) {
      expect(esNombreHumano(t), t).toBe(false)
    }
  })
  it('acepta nombres de verdad', () => {
    for (const t of ['Tele salón', 'Galaxy-S23', 'iPhone de Ana', 'LGwebOSTV', 'HP LaserJet M110w']) expect(esNombreHumano(t), t).toBe(true)
  })
  it('hostLegible quita el dominio local', () => {
    expect(hostLegible('Galaxy-S23.local')).toBe('Galaxy-S23')
    expect(hostLegible('portatil.lan.')).toBe('portatil')
    expect(hostLegible('192-168-1-34.local')).toBeNull()
    expect(hostLegible('a.b.example.com')).toBeNull()
  })
})

describe('tipo más concreto', () => {
  it('una Fire TV que también anuncia Matter y Spotify sale como Fire TV, en cualquier orden', () => {
    const r = leerAvahi([
      '=;wlan0;IPv4;AE36;_matterd._udp;local;B4E4.local;192.168.1.34;5540;',
      '=;wlan0;IPv4;c0b4;_spotify-connect._tcp;local;c0b4.local;192.168.1.34;1;',
      '=;wlan0;IPv4;amzn\\.dmgr\\0584EE0FC13C525142FFD4D7DF5166C144C\\058xnVDMM;Amazon Fire TV;local;192-168-1-34.local;192.168.1.34;2;',
    ].join('\n'))
    expect(nombreDeRed(r.get('192.168.1.34'), null)).toBe('Amazon Fire TV')
  })
  it('si solo hay genéricos, el primero', () => {
    const r = leerAvahi('=;wlan0;IPv4;AE36;_matterd._udp;local;B4E4.local;192.168.1.9;5540;')
    expect(nombreDeRed(r.get('192.168.1.9'), null)).toBe('Aparato domótico (Matter)')
  })
})
