ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS home_lat NUMERIC(9,6);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS home_lon NUMERIC(9,6);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS current_lat NUMERIC(9,6);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS current_lon NUMERIC(9,6);

UPDATE usuarios
SET home_lat = COALESCE(home_lat, lat),
    home_lon = COALESCE(home_lon, lon)
WHERE home_lat IS NULL OR home_lon IS NULL;

