import { parseEwkbPoint } from './postgis.js';

describe('parseEwkbPoint', () => {
  it('parses little-endian EWKB with SRID (as returned by PostGIS)', () => {
    // SELECT 'SRID=4326;POINT(75.124 15.3647)'::geography  (hex EWKB)
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(0x20000001, 1);
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(75.124, 9);
    buf.writeDoubleLE(15.3647, 17);
    expect(parseEwkbPoint(buf.toString('hex'))).toEqual({ longitude: 75.124, latitude: 15.3647 });
  });

  it('parses big-endian EWKB without SRID', () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(-0.1276, 5);
    buf.writeDoubleBE(51.5072, 13);
    expect(parseEwkbPoint(buf.toString('hex'))).toEqual({ longitude: -0.1276, latitude: 51.5072 });
  });

  it('rejects non-point geometries', () => {
    const buf = Buffer.alloc(9);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(3, 1); // POLYGON
    expect(() => parseEwkbPoint(buf.toString('hex'))).toThrow(/POINT/);
  });
});
