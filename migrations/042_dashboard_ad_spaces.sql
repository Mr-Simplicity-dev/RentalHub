-- Allow Super Admin ad placements on tenant and landlord dashboards.

ALTER TABLE ad_spaces
    DROP CONSTRAINT IF EXISTS chk_ad_spaces_placement;

ALTER TABLE ad_spaces
    ADD CONSTRAINT chk_ad_spaces_placement
    CHECK (
        placement IN (
            'home_top',
            'home_featured',
            'dashboard_top',
            'dashboard_inline',
            'properties_top',
            'properties_inline'
        )
    );

UPDATE feature_flags
SET description = 'Show Super Admin managed ads on Home, Dashboard, and Properties pages.',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'ads_enabled';
