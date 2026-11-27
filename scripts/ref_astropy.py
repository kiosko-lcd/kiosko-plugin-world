# Reference sun and moon positions from astropy (independent of the plugin's NOAA/Meeus formulas).
import json
from astropy.time import Time
from astropy.coordinates import get_body, EarthLocation, AltAz, TETE
import astropy.units as u
cases = [
  ['2024-03-20T03:06:00', 0, 0], ['2024-06-20T20:51:00', 0, 0], ['2024-12-21T09:21:00', 0, 0], ['2024-09-22T12:44:00', 0, 0],
  ['2026-11-27T12:00:00', 40.4168, -3.7038], ['2026-06-21T10:00:00', 51.4769, -0.0005], ['2026-01-15T03:00:00', 35.6762, 139.6503],
  ['2026-08-01T22:00:00', -33.8688, 151.2093], ['2026-03-01T17:30:00', 40.7128, -74.006], ['2026-12-21T12:00:00', 78.22, 15.65],
  ['2026-06-21T12:00:00', -77.85, 166.67], ['2026-11-27T07:40:00', 25.2048, 55.2708], ['2030-02-10T18:00:00', -22.9, -43.2],
]
out = []
for iso, lat, lon in cases:
    t = Time(iso, scale='utc')
    loc = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=0*u.m)
    sun = get_body('sun', t)
    moon = get_body('moon', t)
    tete = sun.transform_to(TETE(obstime=t))
    mt = moon.transform_to(TETE(obstime=t))
    gast = t.sidereal_time('apparent', 'greenwich').deg
    sublon = ((tete.ra.deg - gast + 540) % 360) - 180
    moonlon = ((mt.ra.deg - gast + 540) % 360) - 180
    aa = sun.transform_to(AltAz(obstime=t, location=loc, pressure=0*u.hPa))
    elong = sun.separation(moon).deg
    out.append(dict(iso=iso+'Z', lat=lat, lon=lon, decl=round(tete.dec.deg, 4), sublon=round(sublon, 4), elevation=round(aa.alt.deg, 3), azimuth=round(aa.az.deg, 3), moonDecl=round(mt.dec.deg, 3), moonLon=round(moonlon, 3), elongation=round(elong, 3)))
print(json.dumps(out, indent=1))
