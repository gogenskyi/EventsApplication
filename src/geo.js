/**
 * Great-circle (haversine-style) distance in km, as a SQL expression.
 * All arguments are SQL fragments, e.g. a placeholder like "$1" or a column.
 */
export function distanceKmSql(lat, lng, latCol, lngCol) {
  return `(6371*acos(least(1,cos(radians(${lat}))*cos(radians(${latCol}))*cos(radians(${lngCol})-radians(${lng}))+sin(radians(${lat}))*sin(radians(${latCol})))))`;
}
