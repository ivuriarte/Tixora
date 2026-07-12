-- CreateTable
CREATE TABLE "registration_funnel_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "session_id" TEXT,
    "user_id" TEXT,
    "email" TEXT,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "user_agent" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_funnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_funnel_events_event_id_step_idx" ON "registration_funnel_events"("event_id", "step");

-- CreateIndex
CREATE INDEX "registration_funnel_events_step_status_idx" ON "registration_funnel_events"("step", "status");

-- CreateIndex
CREATE INDEX "registration_funnel_events_created_at_idx" ON "registration_funnel_events"("created_at");

-- AddForeignKey
ALTER TABLE "registration_funnel_events" ADD CONSTRAINT "registration_funnel_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_funnel_events" ADD CONSTRAINT "registration_funnel_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
