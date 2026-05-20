-- Allow Super Admin to control whether public ads can be shared by users.

ALTER TABLE ad_spaces
    ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
