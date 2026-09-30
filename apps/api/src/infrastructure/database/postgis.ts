import { customType } from 'drizzle-orm/pg-core';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Parses the hex EWKB that PostgreSQL returns for a geography/geometry POINT
 * (byte order, type with optional SRID flag, [SRID], X = longitude, Y = latitude).
 */
export function parseEwkbPoint(hex: string): GeoPoint {
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf[0] === 1;
  const readUInt32 = (offset: number) => (littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset));
  const readDouble = (offset: number) => (littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset));

  const type = readUInt32(1);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0xff) !== 1) throw new Error('Expected a POINT');
  const offset = 5 + (hasSrid ? 4 : 0);
  return { longitude: readDouble(offset), latitude: readDouble(offset + 8) };
}

/** `geography(Point, 4326)`: WGS-84 coordinates with distances in metres (ADR-0004). */
export const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(point) {
    return `SRID=4326;POINT(${point.longitude} ${point.latitude})`;
  },
  fromDriver(value) {
    return parseEwkbPoint(value);
  },
});
