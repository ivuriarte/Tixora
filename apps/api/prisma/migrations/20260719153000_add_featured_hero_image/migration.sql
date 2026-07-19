-- Keep homepage artwork independent from the event-detail cover so each
-- surface can use an image composed for its own aspect ratio.
ALTER TABLE "events"
ADD COLUMN "featured_image_url" TEXT;
