-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "tier_id" TEXT,
ADD COLUMN     "tier_name" TEXT,
ADD COLUMN     "unit_price" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
