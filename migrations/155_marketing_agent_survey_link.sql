-- How far back a marketing agent's field capture still counts as "this person has
-- already been surveyed".
--
-- The point of the window is to avoid making someone redo work an agent already did,
-- not to judge whether the answers are still fresh — so it is deliberately generous.

INSERT INTO commission_config (key, value, description) VALUES
  ('marketing_agent_survey_link_days', 365,
   'Days back a marketing agent field capture still counts as this account''s survey')
ON CONFLICT (key) DO NOTHING;
